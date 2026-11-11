"""US-48: armado de viajes por repartidor, ruta con Google Maps y avisos con la llegada de cada cliente."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.core.config import settings
from app.models.delivery_driver import DeliveryDriver
from app.models.order import Order
from app.models.store_config import StoreConfig
from app.services import maps_service
from app.services.maps_service import RouteStop, cumulative_eta_minutes

LOCAL = "Av. Mitre 100, Quilmes"


@pytest.fixture(autouse=True)
def local_con_direccion(db_session):
    db_session.add(StoreConfig(store_name="Local", address=LOCAL))
    db_session.commit()


@pytest.fixture()
def avisos():
    with patch("app.services.order_notification_service.enviar_mensaje", new_callable=AsyncMock) as mock:
        yield mock


def _driver(db_session, name="Nico"):
    driver = DeliveryDriver(name=name, phone="1144445555")
    db_session.add(driver)
    db_session.commit()
    db_session.refresh(driver)
    return driver


def _pedido(db_session, direccion, driver=None, status="En Camino", chat="111", metodo="domicilio"):
    order = Order(
        customer_name=f"Cliente {direccion}",
        shipping_address=direccion,
        total_amount=1000.0,
        status=status,
        delivery_method=metodo,
        channel="telegram" if chat else None,
        chat_id=chat,
        delivery_driver_id=driver.id if driver else None,
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    return order


def _ruta(orden_de_paradas, segundos):
    """Respuesta de Google Maps: visita las paradas en `orden_de_paradas` con `segundos` de manejo entre cada una."""
    return [RouteStop(index=i, leg_seconds=s) for i, s in zip(orden_de_paradas, segundos, strict=True)]


@pytest.fixture()
def maps():
    with patch.object(maps_service, "calculate_route") as mock:
        yield mock


def _despachar(client, driver, order_ids=None):
    body = {"delivery_driver_id": driver.id}
    if order_ids is not None:
        body["order_ids"] = order_ids
    return client.post("/api/v1/orders/trips/dispatch", json=body)


# --- Armado silencioso ---


def test_pasar_a_en_camino_y_asignar_repartidor_no_calcula_ruta_ni_avisa(client, db_session, maps, avisos):
    driver = _driver(db_session)
    order = _pedido(db_session, "Calle 1", status="Confirmado")

    client.patch(f"/api/v1/orders/{order.id}/status", json={"status": "En Camino"})
    respuesta = client.patch(f"/api/v1/orders/{order.id}/delivery-driver", json={"delivery_driver_id": driver.id})

    assert respuesta.status_code == 200
    assert respuesta.json()["trip_id"] is None
    maps.assert_not_called()
    avisos.assert_not_called()


# --- Iniciar viaje ---


def test_iniciar_viaje_calcula_una_sola_ruta_con_el_local_de_origen_y_avisa_a_todos(client, db_session, maps, avisos):
    driver = _driver(db_session)
    a = _pedido(db_session, "Calle A 1", driver, chat="111")
    b = _pedido(db_session, "Calle B 2", driver, chat="222")
    c = _pedido(db_session, "Calle C 3", driver, chat="333")
    # Google decide el orden: primero C, después A y por último B.
    maps.return_value = _ruta([2, 0, 1], [600, 300, 420])

    respuesta = _despachar(client, driver)

    assert respuesta.status_code == 201
    maps.assert_called_once_with(LOCAL, ["Calle A 1", "Calle B 2", "Calle C 3"])
    viaje = respuesta.json()
    # Cada parada suma el manejo y la tolerancia de entrega (3 min) de las anteriores.
    assert [(s["order_id"], s["stop"], s["eta_minutes"]) for s in viaje["stops"]] == [
        (c.id, 1, 10),
        (a.id, 2, 18),
        (b.id, 3, 28),
    ]
    assert viaje["total_minutes"] == 28
    mensajes = {call.args[1]: call.args[2] for call in avisos.await_args_list}
    assert mensajes == {
        "333": "¡Tu pedido está en camino! 🛵 Llegará a tu domicilio en aproximadamente 10 minutos.",
        "111": "¡Tu pedido está en camino! 🛵 Llegará a tu domicilio en aproximadamente 18 minutos.",
        "222": "¡Tu pedido está en camino! 🛵 Llegará a tu domicilio en aproximadamente 28 minutos.",
    }
    for pedido in (a, b, c):
        db_session.refresh(pedido)
        assert pedido.trip_id == viaje["id"]


def test_se_puede_despachar_solo_una_parte_de_los_pedidos(client, db_session, maps, avisos):
    driver = _driver(db_session)
    a = _pedido(db_session, "Calle A 1", driver)
    b = _pedido(db_session, "Calle B 2", driver)
    maps.return_value = _ruta([0], [300])

    respuesta = _despachar(client, driver, [a.id])

    assert respuesta.status_code == 201
    maps.assert_called_once_with(LOCAL, ["Calle A 1"])
    db_session.refresh(b)
    assert b.trip_id is None
    assert avisos.await_count == 1


def test_un_pedido_nuevo_del_mismo_repartidor_forma_el_viaje_siguiente(client, db_session, maps, avisos):
    driver = _driver(db_session)
    primero = _pedido(db_session, "Calle A 1", driver)
    maps.return_value = _ruta([0], [300])
    viaje_1 = _despachar(client, driver).json()
    nuevo = _pedido(db_session, "Calle B 2", driver, chat="222")
    avisos.reset_mock()
    maps.reset_mock()
    maps.return_value = _ruta([0], [600])

    viaje_2 = _despachar(client, driver).json()

    # La ruta en curso no se recalcula: la segunda consulta solo incluye al pedido nuevo.
    maps.assert_called_once_with(LOCAL, ["Calle B 2"])
    assert viaje_2["id"] != viaje_1["id"]
    assert [s["order_id"] for s in viaje_2["stops"]] == [nuevo.id]
    assert avisos.await_count == 1
    db_session.refresh(primero)
    assert primero.trip_id == viaje_1["id"]


def test_no_se_puede_iniciar_un_viaje_sin_pedidos_armados(client, db_session, maps):
    driver = _driver(db_session)

    respuesta = _despachar(client, driver)

    assert respuesta.status_code == 400
    assert "no tiene pedidos" in respuesta.json()["detail"]
    maps.assert_not_called()


def test_no_despacha_pedidos_que_no_son_de_ese_repartidor_ni_los_ya_despachados(client, db_session, maps):
    nico, otro = _driver(db_session), _driver(db_session, "Otro")
    suyo = _pedido(db_session, "Calle A 1", nico)
    ajeno = _pedido(db_session, "Calle B 2", otro)
    maps.return_value = _ruta([0], [300])
    _despachar(client, nico)

    respuesta = _despachar(client, nico, [suyo.id, ajeno.id])

    assert respuesta.status_code == 400
    assert f"#{suyo.id}" in respuesta.json()["detail"] and f"#{ajeno.id}" in respuesta.json()["detail"]


def test_los_pedidos_confirmados_o_para_retirar_no_entran_al_viaje(client, db_session, maps):
    driver = _driver(db_session)
    _pedido(db_session, "Calle A 1", driver, status="Confirmado")
    _pedido(db_session, "Retiro en el local", driver, metodo="retiro")

    assert _despachar(client, driver).status_code == 400


def test_sin_direccion_del_local_el_viaje_sale_sin_tiempos(client, db_session, maps, avisos):
    db_session.query(StoreConfig).update({"address": None})
    db_session.commit()
    driver = _driver(db_session)
    order = _pedido(db_session, "Calle A 1", driver)

    respuesta = _despachar(client, driver)

    assert respuesta.status_code == 201
    assert "dirección del local" in respuesta.json()["warning"]
    maps.assert_not_called()
    db_session.refresh(order)
    assert order.trip_id is not None and order.eta_minutes is None


def test_si_google_maps_falla_el_viaje_sale_igual_sin_tiempos(client, db_session, maps, avisos):
    driver = _driver(db_session)
    primero = _pedido(db_session, "Calle A 1", driver, chat="111")
    segundo = _pedido(db_session, "Calle B 2", driver, chat="222")
    maps.side_effect = maps_service.RouteUnavailableError("No se pudo consultar Google Maps.")

    respuesta = _despachar(client, driver)

    assert respuesta.status_code == 201
    viaje = respuesta.json()
    assert viaje["warning"] == "No se pudo consultar Google Maps."
    assert viaje["total_minutes"] is None
    assert [(p["order_id"], p["stop"], p["eta_minutes"]) for p in viaje["stops"]] == [
        (primero.id, 1, None),
        (segundo.id, 2, None),
    ]
    for pedido in (primero, segundo):
        db_session.refresh(pedido)
        assert pedido.trip_id == viaje["id"] and pedido.eta_minutes is None
    # Los clientes reciben igualmente el aviso de que salió el pedido, sin prometer un tiempo.
    assert avisos.await_count == 2
    assert all(call.args[1:2] == ("111",) or call.args[1:2] == ("222",) for call in avisos.await_args_list)


def test_el_aviso_sin_tiempo_solo_dice_que_esta_en_camino():
    from app.services.order_notification_service import OrderSnapshot, build_trip_message

    sin_tiempo = OrderSnapshot(id=1, shift_number=1, channel="telegram", chat_id="1", estimated_minutes=None, scheduled_for=None)
    con_tiempo = OrderSnapshot(id=1, shift_number=1, channel="telegram", chat_id="1", estimated_minutes=None, scheduled_for=None, eta_minutes=15)

    assert build_trip_message(sin_tiempo) == "¡Tu pedido está en camino! 🛵"
    assert "15 minutos" in build_trip_message(con_tiempo)


def test_un_aviso_que_falla_no_corta_los_de_los_demas_clientes(client, db_session, maps, avisos):
    driver = _driver(db_session)
    _pedido(db_session, "Calle A 1", driver, chat="111")
    _pedido(db_session, "Calle B 2", driver, chat="222")
    maps.return_value = _ruta([0, 1], [300, 300])
    avisos.side_effect = [RuntimeError("falló"), None]

    assert _despachar(client, driver).status_code == 201
    assert avisos.await_count == 2


def test_los_pedidos_sin_chat_salen_en_el_viaje_pero_no_reciben_aviso(client, db_session, maps, avisos):
    driver = _driver(db_session)
    _pedido(db_session, "Calle A 1", driver, chat=None)
    maps.return_value = _ruta([0], [300])

    assert _despachar(client, driver).status_code == 201
    avisos.assert_not_called()


def test_el_repartidor_de_un_pedido_despachado_no_se_puede_cambiar(client, db_session, maps):
    nico, otro = _driver(db_session), _driver(db_session, "Otro")
    order = _pedido(db_session, "Calle A 1", nico)
    maps.return_value = _ruta([0], [300])
    _despachar(client, nico)

    respuesta = client.patch(f"/api/v1/orders/{order.id}/delivery-driver", json={"delivery_driver_id": otro.id})

    assert respuesta.status_code == 400
    assert "ya salió" in respuesta.json()["detail"]


def test_requiere_administrador(public_client, customer_headers):
    body = {"delivery_driver_id": 1}
    assert public_client.post("/api/v1/orders/trips/dispatch", json=body).status_code == 401
    assert public_client.post("/api/v1/orders/trips/dispatch", json=body, headers=customer_headers).status_code == 403


# --- Cálculo de tiempos ---


def test_eta_acumulado_suma_el_manejo_y_la_tolerancia_de_las_paradas_anteriores():
    paradas = _ruta([0, 1, 2], [600, 300, 420])

    assert cumulative_eta_minutes(paradas, tolerance_minutes=3) == [10, 18, 28]
    assert cumulative_eta_minutes(paradas, tolerance_minutes=0) == [10, 15, 22]


def test_eta_redondea_hacia_arriba_y_nunca_es_cero():
    assert cumulative_eta_minutes(_ruta([0], [61]), 3) == [2]
    assert cumulative_eta_minutes(_ruta([0], [5]), 3) == [1]


# --- Cliente de Google Maps ---


def _google(payload, status_code=200):
    respuesta = MagicMock()
    respuesta.status_code = status_code
    respuesta.content = b"{}"
    respuesta.json.return_value = payload
    return respuesta


@pytest.fixture()
def con_clave(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_MAPS_API_KEY", "clave-de-prueba")


def _geo(*puntos):
    """Respuesta de la Geocoding API con una ubicación por punto (lat, lng)."""
    resultados = [{"geometry": {"location": {"lat": lat, "lng": lng}}} for lat, lng in puntos]
    return {"status": "OK", "results": resultados}


# El local y dos "Alvear 123": una a ~1 km y otra en otra ciudad.
PUNTO_LOCAL = (-34.6000, -58.4000)
ALVEAR_CERCA = (-34.6050, -58.4050)
ALVEAR_LEJOS = (-31.4200, -64.1900)


def _geocodificador(por_direccion):
    def get(url, params, timeout):
        return _google(por_direccion[params["address"]])

    return get


def test_ubica_la_direccion_mas_cercana_al_local(con_clave):
    with patch("app.services.maps_service.httpx.get", return_value=_google(_geo(ALVEAR_LEJOS, ALVEAR_CERCA))):
        assert maps_service._locate_near("Alvear 123", PUNTO_LOCAL) == ALVEAR_CERCA


def test_la_busqueda_de_direcciones_se_sesga_a_la_zona_del_local(con_clave):
    with patch("app.services.maps_service.httpx.get", return_value=_google(_geo(ALVEAR_CERCA))) as get:
        maps_service._locate_near("Alvear 123", PUNTO_LOCAL)

    params = get.call_args.kwargs["params"]
    assert params["address"] == "Alvear 123"
    assert params["bounds"].startswith("-34.85,-58.65|")
    assert params["components"] == "country:AR"


def test_rechaza_una_direccion_demasiado_lejos_del_local(con_clave):
    with (
        patch("app.services.maps_service.httpx.get", return_value=_google(_geo(ALVEAR_LEJOS))),
        pytest.raises(maps_service.RouteUnavailableError, match="más de 50 km"),
    ):
        maps_service._locate_near("Alvear 123", PUNTO_LOCAL)


def test_direccion_sin_resultados_no_se_ubica(con_clave):
    with (
        patch("app.services.maps_service.httpx.get", return_value=_google({"status": "ZERO_RESULTS", "results": []})),
        pytest.raises(maps_service.RouteUnavailableError, match="no pudo ubicar la dirección «Alvear 123»"),
    ):
        maps_service._locate_near("Alvear 123", PUNTO_LOCAL)


def test_busca_primero_dentro_del_partido_del_local(con_clave):
    # Sin restringir, Google devuelve una sola "Alsina 328" (la de otra ciudad); dentro del partido hay una cercana.
    def get(url, params, timeout):
        if "administrative_area:Quilmes" in params.get("components", ""):
            return _google(_geo(ALVEAR_CERCA))
        return _google(_geo(ALVEAR_LEJOS))

    with patch("app.services.maps_service.httpx.get", side_effect=get):
        assert maps_service._locate_near("Alsina 328", PUNTO_LOCAL, area="Quilmes") == ALVEAR_CERCA


def test_si_en_el_partido_no_hay_nada_busca_en_la_zona_cercana(con_clave):
    # Un cliente de un barrio vecino: dentro del partido no aparece, pero sí en la zona alrededor del local.
    def get(url, params, timeout):
        if "administrative_area" in params.get("components", ""):
            return _google({"status": "ZERO_RESULTS", "results": []})
        return _google(_geo(ALVEAR_CERCA))

    with patch("app.services.maps_service.httpx.get", side_effect=get):
        assert maps_service._locate_near("Calle del vecino 5", PUNTO_LOCAL, area="Quilmes") == ALVEAR_CERCA


def test_el_partido_del_local_sale_de_su_propia_ubicacion(con_clave):
    local = {
        "geometry": {"location": {"lat": PUNTO_LOCAL[0], "lng": PUNTO_LOCAL[1]}},
        "address_components": [
            {"long_name": "Quilmes", "types": ["locality", "political"]},
            {"long_name": "Quilmes", "types": ["administrative_area_level_2", "political"]},
            {"long_name": "Provincia de Buenos Aires", "types": ["administrative_area_level_1", "political"]},
        ],
    }
    consultas = []

    def get(url, params, timeout):
        consultas.append(params)
        if params["address"] == LOCAL:
            return _google({"status": "OK", "results": [local]})
        return _google(_geo(ALVEAR_CERCA))

    payload = {"routes": [{"optimizedIntermediateWaypointIndex": [0], "legs": [{"duration": "60s"}, {"duration": "60s"}]}]}
    with (
        patch("app.services.maps_service.httpx.get", side_effect=get),
        patch("app.services.maps_service.httpx.post", return_value=_google(payload)),
    ):
        maps_service.calculate_route(LOCAL, ["Alsina 328"])

    assert "administrative_area" not in consultas[0].get("components", "")
    assert consultas[1]["components"] == "country:AR|administrative_area:Quilmes"


def test_pide_una_sola_ruta_optimizada_con_vuelta_al_local(con_clave):
    ubicaciones = {LOCAL: _geo(PUNTO_LOCAL), "Calle A 1": _geo(ALVEAR_CERCA), "Calle B 2": _geo((-34.61, -58.41))}
    payload = {
        "routes": [
            {
                "optimizedIntermediateWaypointIndex": [1, 0],
                "legs": [{"duration": "300s"}, {"duration": "420s"}, {"duration": "900s"}],
            }
        ],
    }
    with (
        patch("app.services.maps_service.httpx.get", side_effect=_geocodificador(ubicaciones)),
        patch("app.services.maps_service.httpx.post", return_value=_google(payload)) as post,
    ):
        paradas = maps_service.calculate_route(LOCAL, ["Calle A 1", "Calle B 2"])

    post.assert_called_once()
    body = post.call_args.kwargs["json"]
    local = {"location": {"latLng": {"latitude": PUNTO_LOCAL[0], "longitude": PUNTO_LOCAL[1]}}}
    assert (body["origin"], body["destination"]) == (local, local)
    assert body["intermediates"][0]["location"]["latLng"] == {"latitude": ALVEAR_CERCA[0], "longitude": ALVEAR_CERCA[1]}
    assert len(body["intermediates"]) == 2
    assert body["optimizeWaypointOrder"] is True
    headers = post.call_args.kwargs["headers"]
    assert headers["X-Goog-Api-Key"] == "clave-de-prueba"
    assert "optimizedIntermediateWaypointIndex" in headers["X-Goog-FieldMask"]
    # La vuelta al local (tercer tramo) no cuenta.
    assert paradas == [RouteStop(index=1, leg_seconds=300), RouteStop(index=0, leg_seconds=420)]


@pytest.fixture()
def ubica_todo():
    with patch("app.services.maps_service.httpx.get", return_value=_google(_geo(PUNTO_LOCAL))):
        yield


@pytest.mark.parametrize(
    "status_code,status,texto",
    [
        (404, "NOT_FOUND", "ubicar"),
        (400, "INVALID_ARGUMENT", "ubicar"),
        (403, "PERMISSION_DENIED", "rechazó"),
        (500, "INTERNAL", "no pudo calcular"),
    ],
)
def test_traduce_los_errores_de_google_maps(con_clave, ubica_todo, status_code, status, texto):
    with (
        patch("app.services.maps_service.httpx.post", return_value=_google({"error": {"status": status}}, status_code)),
        pytest.raises(maps_service.RouteUnavailableError, match=texto),
    ):
        maps_service.calculate_route(LOCAL, ["Calle A 1"])


def test_una_respuesta_sin_rutas_se_trata_como_direccion_no_ubicada(con_clave, ubica_todo):
    with (
        patch("app.services.maps_service.httpx.post", return_value=_google({})),
        pytest.raises(maps_service.RouteUnavailableError, match="ubicar"),
    ):
        maps_service.calculate_route(LOCAL, ["Calle A 1"])


def test_si_la_geocoding_api_rechaza_la_consulta_se_informa(con_clave):
    with (
        patch("app.services.maps_service.httpx.get", return_value=_google({"status": "REQUEST_DENIED"})),
        pytest.raises(maps_service.RouteUnavailableError, match="Geocoding API"),
    ):
        maps_service.calculate_route(LOCAL, ["Calle A 1"])


def test_sin_clave_de_google_maps_explica_que_falta_configurarla(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_MAPS_API_KEY", "")

    with pytest.raises(maps_service.RouteUnavailableError, match="GOOGLE_MAPS_API_KEY"):
        maps_service.calculate_route(LOCAL, ["Calle A 1"])


def test_si_google_maps_no_responde_se_informa(con_clave):
    with (
        patch("app.services.maps_service.httpx.get", side_effect=httpx.ConnectTimeout("timeout")),
        pytest.raises(maps_service.RouteUnavailableError, match="No se pudo consultar"),
    ):
        maps_service.calculate_route(LOCAL, ["Calle A 1"])


def test_un_viaje_admite_un_maximo_de_paradas(con_clave):
    with pytest.raises(maps_service.RouteUnavailableError, match="hasta"):
        maps_service.calculate_route(LOCAL, [f"Calle {i}" for i in range(maps_service.MAX_STOPS_PER_TRIP + 1)])
