"""US-41: el local carga la imagen de su menú y el bot se la manda a los clientes que la piden."""

import asyncio
import json
import time
from unittest.mock import patch

import httpx
import pytest
from langchain_core.messages import AIMessage
from langchain_core.utils.function_calling import convert_to_openai_tool

from app.core.config import settings
from app.models.menu import MAX_IMAGE_BYTES
from app.models.menu_image import MAX_MENU_IMAGES
from app.services import menu_image_service
from app.services.channels.base import ImagenParaEnviar
from app.services.channels.telegram import TelegramChannel
from app.services.channels.whatsapp import WhatsAppChannel
from app.services.chat_service import ChatService
from app.services.tools.menu_image_tools import (
    MENSAJE_MENU_ENVIADO,
    PIE_DE_FOTO,
    RESULTADO_SIN_IMAGEN,
    enviar_menu_en_imagen,
)
from tests.conftest import TestingSessionLocal

URL = "/api/v1/menu-image"
PNG = b"\x89PNG\r\n\x1a\n" + b"menu-v1" * 20
JPG = b"\xff\xd8\xff\xe0" + b"menu-v2" * 20


def _con_tamano(cabecera: bytes, total: int) -> bytes:
    return cabecera + b"0" * (total - len(cabecera))


# --- Gestión desde el panel ---


def _subir(client, data: bytes, content_type="image/png"):
    return client.post(URL, content=data, headers={"Content-Type": content_type})


def _imagenes(client) -> list[dict]:
    return client.get(URL).json()["images"]


def test_sin_imagenes_cargadas(client):
    respuesta = client.get(URL)

    assert respuesta.status_code == 200
    assert respuesta.json() == {"images": [], "max_images": MAX_MENU_IMAGES}


def test_el_dueno_carga_una_imagen_y_la_previsualiza(client):
    respuesta = _subir(client, PNG)

    assert respuesta.status_code == 201
    [imagen] = respuesta.json()["images"]
    assert imagen["content_type"] == "image/png" and imagen["size_bytes"] == len(PNG)
    assert imagen["image_url"].startswith(f"/menu-image/{imagen['id']}/file?v=")
    # La imagen se ve en la dirección que informa (pública, como las de los productos).
    archivo = client.get(f"/api/v1{imagen['image_url']}")
    assert archivo.status_code == 200
    assert (archivo.content, archivo.headers["content-type"]) == (PNG, "image/png")


def test_el_menu_puede_ser_varias_imagenes_en_el_orden_en_que_se_cargan(client):
    _subir(client, PNG)
    _subir(client, JPG, "image/jpeg")
    _subir(client, PNG + b"3")

    imagenes = _imagenes(client)

    assert [i["content_type"] for i in imagenes] == ["image/png", "image/jpeg", "image/png"]
    assert len({i["id"] for i in imagenes}) == 3


def test_el_menu_admite_un_maximo_de_imagenes(client):
    for _ in range(MAX_MENU_IMAGES):
        assert _subir(client, PNG).status_code == 201

    respuesta = _subir(client, PNG)

    assert respuesta.status_code == 400
    assert str(MAX_MENU_IMAGES) in respuesta.json()["detail"]
    assert len(_imagenes(client)) == MAX_MENU_IMAGES


def test_reemplazar_una_imagen_la_cambia_sin_moverla_de_lugar(client):
    _subir(client, PNG)
    segunda = _subir(client, PNG + b"2").json()["images"][1]
    _subir(client, PNG + b"3")
    time.sleep(0.01)  # la versión sale de la hora de carga

    respuesta = client.put(f"{URL}/{segunda['id']}", content=JPG, headers={"Content-Type": "image/jpeg"})

    imagenes = respuesta.json()["images"]
    assert imagenes[1]["id"] == segunda["id"]
    assert imagenes[1]["image_url"] != segunda["image_url"]  # el panel no muestra una copia vieja
    assert client.get(f"/api/v1{imagenes[1]['image_url']}").content == JPG
    assert len(imagenes) == 3


def test_el_bot_envia_la_version_nueva_apenas_se_reemplaza(client, db_session):
    primera = _subir(client, PNG).json()["images"][0]
    version_anterior = menu_image_service.get_required_menu_image(db_session, primera["id"]).version
    time.sleep(0.01)

    client.put(f"{URL}/{primera['id']}", content=JPG, headers={"Content-Type": "image/jpeg"})
    db_session.expire_all()
    despues = menu_image_service.get_required_menu_image(db_session, primera["id"])

    assert despues.version > version_anterior and despues.data == JPG


def test_cambiar_el_orden_de_las_imagenes(client):
    for contenido in (PNG, PNG + b"2", PNG + b"3"):
        _subir(client, contenido)
    a, b, c = (i["id"] for i in _imagenes(client))

    respuesta = client.put(f"{URL}/order", json={"ids": [c, a, b]})

    assert respuesta.status_code == 200
    assert [i["id"] for i in respuesta.json()["images"]] == [c, a, b]
    assert [i["id"] for i in _imagenes(client)] == [c, a, b]
    # Las que se suban después van al final.
    _subir(client, PNG + b"4")
    assert [i["id"] for i in _imagenes(client)][:3] == [c, a, b]


@pytest.mark.parametrize("ids", [[], [1], [1, 1], [999, 1000]])
def test_el_nuevo_orden_tiene_que_incluir_todas_las_imagenes_una_sola_vez(client, ids):
    _subir(client, PNG)
    _subir(client, PNG + b"2")

    assert client.put(f"{URL}/order", json={"ids": ids}).status_code == 400


def test_eliminar_una_imagen_deja_las_demas(client):
    _subir(client, PNG)
    _subir(client, JPG, "image/jpeg")
    primera, segunda = _imagenes(client)

    assert client.delete(f"{URL}/{primera['id']}").status_code == 204

    assert [i["id"] for i in _imagenes(client)] == [segunda["id"]]
    assert client.get(f"/api/v1{primera['image_url']}").status_code == 404


def test_eliminar_o_reemplazar_una_imagen_que_no_existe(client):
    assert client.delete(f"{URL}/999").status_code == 404
    assert client.put(f"{URL}/999", content=PNG).status_code == 404


# --- Validación (formato y peso) ---


def test_acepta_una_imagen_de_exactamente_el_maximo(client):
    assert _subir(client, _con_tamano(PNG, MAX_IMAGE_BYTES)).status_code == 201


def test_rechaza_una_imagen_que_supera_el_maximo_de_whatsapp(client):
    respuesta = _subir(client, _con_tamano(PNG, MAX_IMAGE_BYTES + 1))

    assert respuesta.status_code == 413
    assert "5 MB" in respuesta.json()["detail"]
    assert _imagenes(client) == []


@pytest.mark.parametrize(
    "contenido",
    [b"GIF89a" + b"0" * 50, b"%PDF-1.4" + b"0" * 50, b"no soy una imagen", b""],
    ids=["gif", "pdf", "texto", "vacio"],
)
def test_solo_se_aceptan_jpg_y_png_por_su_contenido(client, contenido):
    # El nombre o lo que declare el navegador no cuenta: se mira el archivo.
    respuesta = _subir(client, contenido, "image/png")

    assert respuesta.status_code == 415
    assert _imagenes(client) == []


def test_una_imagen_invalida_no_pisa_la_vigente(client):
    imagen = _subir(client, PNG).json()["images"][0]

    respuesta = client.put(f"{URL}/{imagen['id']}", content=b"GIF89a" + b"0" * 50)

    assert respuesta.status_code == 415
    assert client.get(f"/api/v1{imagen['image_url']}").content == PNG


def test_solo_un_administrador_puede_cambiar_las_imagenes(public_client):
    assert public_client.post(URL, content=PNG).status_code in (401, 403)
    assert public_client.put(f"{URL}/1", content=PNG).status_code in (401, 403)
    assert public_client.put(f"{URL}/order", json={"ids": []}).status_code in (401, 403)
    assert public_client.delete(f"{URL}/1").status_code in (401, 403)
    assert public_client.get(URL).status_code in (401, 403)


# --- Envío por WhatsApp ---


@pytest.fixture()
def meta(monkeypatch):
    """Meta falso: guarda los pedidos y deja configurar qué responde cada ruta."""
    estado = {"media": [], "mensajes": [], "falla_el_envio": 0}
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "token")
    monkeypatch.setattr(settings, "WHATSAPP_PHONE_NUMBER_ID", "555")

    def responder(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/media"):
            estado["media"].append(request)
            return httpx.Response(200, json={"id": f"media-{len(estado['media'])}"})
        estado["mensajes"].append(request)
        if estado["falla_el_envio"] > 0:
            estado["falla_el_envio"] -= 1
            return httpx.Response(400, json={"error": {"message": "media no existe"}})
        return httpx.Response(200, json={})

    canal = WhatsAppChannel()
    monkeypatch.setattr(canal, "_cliente", lambda: httpx.AsyncClient(transport=httpx.MockTransport(responder)))
    estado["canal"] = canal
    return estado


def _imagen(version=1, data=PNG, content_type="image/png", clave=0) -> ImagenParaEnviar:
    return ImagenParaEnviar(version, content_type, lambda: data, clave=clave)


def test_whatsapp_sube_la_imagen_y_la_envia_con_pie_de_foto(meta):
    enviada = asyncio.run(meta["canal"].enviar_imagen("5491162939338", _imagen(), "¡Acá te envío nuestro menú!"))

    assert enviada is True
    [subida] = meta["media"]
    assert subida.url.path == f"/{settings.WHATSAPP_API_VERSION}/555/media"
    assert b'name="messaging_product"' in subida.content and PNG in subida.content
    [mensaje] = meta["mensajes"]
    assert json.loads(mensaje.content) == {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": "541162939338",
        "type": "image",
        "image": {"id": "media-1", "caption": "¡Acá te envío nuestro menú!"},
    }


def test_whatsapp_no_vuelve_a_subir_la_misma_version(meta):
    canal = meta["canal"]

    for _ in range(3):
        asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=7), "pie"))

    assert len(meta["media"]) == 1 and len(meta["mensajes"]) == 3


def test_whatsapp_recuerda_cada_imagen_del_menu_por_separado(meta):
    canal = meta["canal"]

    for _ in range(2):
        asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=5, clave=1), "pie"))
        asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=5, data=JPG, clave=2), "pie"))

    assert len(meta["media"]) == 2 and len(meta["mensajes"]) == 4


def test_whatsapp_sin_pie_de_foto_manda_la_imagen_sola(meta):
    asyncio.run(meta["canal"].enviar_imagen("5491162939338", _imagen(), ""))

    assert json.loads(meta["mensajes"][0].content)["image"] == {"id": "media-1"}


def test_whatsapp_sube_de_nuevo_cuando_cambia_la_imagen(meta):
    canal = meta["canal"]
    asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=1), "pie"))

    asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=2, data=JPG, content_type="image/jpeg"), "pie"))

    assert len(meta["media"]) == 2 and b"image/jpeg" in meta["media"][1].content


def test_whatsapp_reintenta_con_una_subida_nueva_si_la_guardada_ya_no_sirve(meta):
    canal = meta["canal"]
    asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=1), "pie"))
    meta["falla_el_envio"] = 1  # la imagen que Meta tenía guardada venció

    enviada = asyncio.run(canal.enviar_imagen("5491162939338", _imagen(version=1), "pie"))

    assert enviada is True and len(meta["media"]) == 2


def test_whatsapp_si_falla_el_envio_de_una_subida_recien_hecha_no_insiste(meta, caplog):
    meta["falla_el_envio"] = 5

    enviada = asyncio.run(meta["canal"].enviar_imagen("5491162939338", _imagen(), "pie"))

    assert enviada is False and len(meta["media"]) == 1
    assert "Error al enviar la imagen a WhatsApp" in caplog.text


def test_whatsapp_sin_credenciales_no_envia(meta, monkeypatch):
    monkeypatch.setattr(settings, "WHATSAPP_ACCESS_TOKEN", "")

    assert asyncio.run(meta["canal"].enviar_imagen("5491162939338", _imagen(), "pie")) is False
    assert meta["media"] == []


# --- Envío por Telegram ---


def test_telegram_envia_la_foto_con_pie(monkeypatch):
    pedidos = []

    def responder(request: httpx.Request) -> httpx.Response:
        pedidos.append(request)
        return httpx.Response(200, json={"ok": True})

    canal = TelegramChannel()
    monkeypatch.setattr(canal, "_cliente", lambda: httpx.AsyncClient(transport=httpx.MockTransport(responder)))

    enviada = asyncio.run(canal.enviar_imagen("12345", _imagen(), "¡Acá te envío nuestro menú!"))

    assert enviada is True
    [pedido] = pedidos
    assert pedido.url.path.endswith("/sendPhoto")
    assert b"12345" in pedido.content and PNG in pedido.content and "nuestro menú".encode() in pedido.content


# --- La herramienta del bot ---


class CanalFalso:
    def __init__(self, resultado=True):
        self.resultado = resultado
        self.resultados: list[bool] = []  # si se indica, resultado de cada envío en orden
        self.enviadas: list[tuple[str, ImagenParaEnviar, str]] = []

    async def enviar_imagen(self, chat_id, imagen, pie):
        self.enviadas.append((chat_id, imagen, pie))
        return self.resultados[len(self.enviadas) - 1] if self.resultados else self.resultado


@pytest.fixture()
def canal_falso():
    canal = CanalFalso()
    with patch("app.services.tools.menu_image_tools.SessionLocal", TestingSessionLocal), \
         patch("app.services.tools.menu_image_tools.obtener_canal", return_value=canal):
        yield canal


def test_espera_a_que_cada_imagen_se_entregue_para_que_el_mensaje_final_llegue_ultimo(db_session, canal_falso):
    _cargar_menu(db_session, PNG, JPG)
    canal_falso.segundos_de_entrega_de_imagen = 1.5
    pausas = []

    async def pausar(segundos):
        pausas.append((len(canal_falso.enviadas), segundos))

    with patch("app.services.tools.menu_image_tools.asyncio.sleep", pausar):
        assert _pedir_menu() == MENSAJE_MENU_ENVIADO

    # Una pausa después de cada imagen, incluida la última, antes de que salga el mensaje que invita a pedir.
    assert pausas == [(1, 1.5), (2, 1.5)]


def test_whatsapp_espera_a_que_se_entregue_la_imagen_pero_telegram_no():
    assert WhatsAppChannel.segundos_de_entrega_de_imagen > 0
    assert TelegramChannel.segundos_de_entrega_de_imagen == 0


def _cargar_menu(db, *imagenes: bytes):
    for data in imagenes or (PNG,):
        menu_image_service.add_menu_image(db, data)


def _pedir_menu(canal="whatsapp", chat_id="5491162939338") -> str:
    return asyncio.run(enviar_menu_en_imagen.ainvoke({"canal": canal, "chat_id": chat_id}))


def test_la_herramienta_manda_la_imagen_vigente_con_pie_de_foto(db_session, canal_falso):
    _cargar_menu(db_session)

    resultado = _pedir_menu()

    assert resultado == MENSAJE_MENU_ENVIADO
    [(chat_id, imagen, pie)] = canal_falso.enviadas
    assert (chat_id, pie) == ("5491162939338", PIE_DE_FOTO)
    assert imagen.content_type == "image/png" and imagen.cargar() == PNG


def test_la_herramienta_manda_todas_las_imagenes_en_orden_con_el_pie_solo_en_la_primera(db_session, canal_falso):
    _cargar_menu(db_session, PNG, JPG, PNG + b"3")

    resultado = _pedir_menu()

    assert resultado == MENSAJE_MENU_ENVIADO
    assert [pie for _, _, pie in canal_falso.enviadas] == [PIE_DE_FOTO, "", ""]
    assert [imagen.cargar() for _, imagen, _ in canal_falso.enviadas] == [PNG, JPG, PNG + b"3"]
    assert len({imagen.clave for _, imagen, _ in canal_falso.enviadas}) == 3


def test_si_falla_una_imagen_del_medio_el_resto_igual_se_manda(db_session, canal_falso):
    _cargar_menu(db_session, PNG, JPG, PNG + b"3")
    canal_falso.resultados = [True, False, True]

    assert _pedir_menu() == MENSAJE_MENU_ENVIADO
    assert len(canal_falso.enviadas) == 3


def test_si_falla_la_primera_imagen_no_insiste_y_cae_al_menu_en_texto(db_session, canal_falso):
    _cargar_menu(db_session, PNG, JPG)
    canal_falso.resultado = False

    assert _pedir_menu() == RESULTADO_SIN_IMAGEN
    assert len(canal_falso.enviadas) == 1


def test_sin_imagen_cargada_el_bot_cae_al_menu_en_texto(db_session, canal_falso):
    assert _pedir_menu() == RESULTADO_SIN_IMAGEN
    assert canal_falso.enviadas == []


def test_si_el_canal_no_pudo_enviarla_el_bot_cae_al_menu_en_texto(db_session, canal_falso):
    _cargar_menu(db_session)
    canal_falso.resultado = False

    assert _pedir_menu() == RESULTADO_SIN_IMAGEN


def test_en_el_chat_de_prueba_del_panel_no_se_envia_imagen(db_session, canal_falso):
    _cargar_menu(db_session)

    assert _pedir_menu(canal=None, chat_id=None) == RESULTADO_SIN_IMAGEN


# --- El cliente pide el menú ---


class LLM:
    def __init__(self, *respuestas: AIMessage):
        self.respuestas = list(respuestas)
        self.llamadas = 0

    def bind_tools(self, _herramientas):
        return self

    async def ainvoke(self, _mensajes):
        self.llamadas += 1
        return self.respuestas.pop(0)


def _pide_la_herramienta() -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": "enviar_menu_en_imagen", "args": {}, "id": "c1"}])


@pytest.mark.parametrize("pedido", ["pasame el menú", "qué tienen", "mandame la carta", "precios"])
def test_el_bot_manda_la_imagen_y_responde_sin_otra_llamada_al_modelo(db_session, canal_falso, pedido):
    _cargar_menu(db_session)
    llm = LLM(_pide_la_herramienta())

    respuesta = asyncio.run(ChatService(llm=llm).obtener_respuesta(pedido, session_id="whatsapp:5491162939338"))

    assert respuesta == MENSAJE_MENU_ENVIADO  # el pie de foto va con la imagen; esto es el mensaje que invita a pedir
    assert llm.llamadas == 1
    [(chat_id, _, pie)] = canal_falso.enviadas
    assert (chat_id, pie) == ("5491162939338", PIE_DE_FOTO)


def test_sin_imagen_el_modelo_sigue_con_el_menu_en_texto(db_session, canal_falso):
    llm = LLM(_pide_la_herramienta(), AIMessage(content="Este es nuestro menú: ..."))

    respuesta = asyncio.run(ChatService(llm=llm).obtener_respuesta("el menú", session_id="whatsapp:5491162939338"))

    assert respuesta == "Este es nuestro menú: ..."
    assert llm.llamadas == 2


def test_las_instrucciones_del_bot_describen_cuando_mandar_el_menu(db_session):
    prompt = ChatService(llm=LLM()).system_prompt

    assert "enviar_menu_en_imagen" in prompt
    for palabra in ("la carta", "qué tienen", "los precios"):
        assert palabra in prompt


def test_la_herramienta_no_expone_datos_del_chat_al_modelo():
    # Lo que se le manda al modelo al enlazar la herramienta: nada, el sistema completa canal y chat. (`.args` no sirve
    # para esto: según la versión de Python/langchain también lista los argumentos inyectados.)
    parametros = convert_to_openai_tool(enviar_menu_en_imagen)["function"]["parameters"]

    assert parametros.get("properties", {}) == {}
