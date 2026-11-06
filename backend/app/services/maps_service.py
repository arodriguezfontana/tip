"""Cálculo de rutas con Google Maps (Routes API) para los viajes de los repartidores.

Cada dirección se ubica con la Geocoding API, buscando primero dentro del partido del local ("Alvear 123" existe en
muchas ciudades) y, si hay varias coincidencias, eligiendo la más cercana al local. Después una sola consulta de ruta
por viaje: el origen es el local, las paradas son los pedidos y Google las ordena para que el recorrido sea el más
corto. La ruta se pide como una vuelta completa al local (así el orden de las paradas es el óptimo para ir y volver);
la vuelta no se cuenta para los tiempos de llegada de los clientes.
"""

import logging
import math
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.errors import BusinessRuleError

logger = logging.getLogger(__name__)
# httpx registra la URL de cada consulta, y en las de Google Maps viaja la clave: no debe quedar en los logs.
logging.getLogger("httpx").setLevel(logging.WARNING)

# Límite de Google: 25 paradas intermedias por consulta (con el orden optimizado, ver computeRoutes).
MAX_STOPS_PER_TRIP = 25


class RouteUnavailableError(BusinessRuleError):
    """No se pudo calcular la ruta (Google Maps no está configurado, no encontró una dirección o no respondió)."""


# Zona (en grados, ~28 km) alrededor del local en la que Google busca primero las direcciones.
_BIAS_DEGREES = 0.25


def _distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distancia en línea recta entre dos puntos (lat, lng), fórmula de haversine."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def _search(address: str, near: tuple[float, float] | None = None, area: str | None = None) -> list[dict]:
    """Resultados crudos de la Geocoding API. `near` sesga la búsqueda a esa zona; `area` la restringe a un partido."""
    region = settings.GOOGLE_MAPS_REGION
    params = {"address": address, "language": "es", "key": settings.GOOGLE_MAPS_API_KEY}
    components = []
    if region:
        params["region"] = region
        components.append(f"country:{region.upper()}")
    if area:
        components.append(f"administrative_area:{area}")
    if components:
        params["components"] = "|".join(components)
    if near:
        lat, lng = near
        params["bounds"] = f"{lat - _BIAS_DEGREES},{lng - _BIAS_DEGREES}|{lat + _BIAS_DEGREES},{lng + _BIAS_DEGREES}"
    try:
        data = httpx.get(settings.GOOGLE_MAPS_GEOCODE_URL, params=params, timeout=15.0).json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Error consultando Google Maps: %s", exc)
        raise RouteUnavailableError("No se pudo consultar Google Maps. Probá de nuevo en un momento.") from exc

    status = data.get("status")
    if status == "ZERO_RESULTS":
        return []
    if status != "OK":
        logger.error("Google Maps (geocoding) respondió %s: %s", status, data.get("error_message"))
        if status in ("REQUEST_DENIED", "OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT"):
            raise RouteUnavailableError(
                "Google Maps rechazó la consulta (revisá la clave, que la Geocoding API esté habilitada y la cuota)."
            )
        raise RouteUnavailableError("Google Maps no pudo ubicar las direcciones del viaje.")
    results = data.get("results")
    if not isinstance(results, list):
        logger.error("Respuesta inesperada de Google Maps: %s", data)
        raise RouteUnavailableError("Google Maps respondió con un formato inesperado.")
    return results


def _point(result: dict) -> tuple[float, float]:
    try:
        return result["geometry"]["location"]["lat"], result["geometry"]["location"]["lng"]
    except (KeyError, TypeError) as exc:
        logger.error("Respuesta inesperada de Google Maps: %s", result)
        raise RouteUnavailableError("Google Maps respondió con un formato inesperado.") from exc


def _area_of(result: dict) -> str | None:
    """Partido o ciudad de un resultado (Quilmes, Lanús...), para buscar primero las direcciones dentro de él."""
    by_type = {t: c.get("long_name") for c in result.get("address_components", []) for t in c.get("types", [])}
    return by_type.get("administrative_area_level_2") or by_type.get("locality") or by_type.get("administrative_area_level_1")


def _locate_near(address: str, origin: tuple[float, float], area: str | None = None) -> tuple[float, float]:
    """Ubicación de la dirección más cercana al local entre todas las que coinciden con ese nombre.

    Google suele devolver una sola coincidencia (la que considera más probable en todo el país), que puede estar en
    otra ciudad: por eso se busca primero dentro del partido del local y solo si ahí no hay nada, en una zona más amplia
    alrededor."""
    results = (_search(address, near=origin, area=area) if area else []) or _search(address, near=origin)
    candidates = [_point(result) for result in results]
    if not candidates:
        raise RouteUnavailableError(
            f"Google Maps no pudo ubicar la dirección «{address}». Revisá la dirección del pedido."
        )
    nearest = min(candidates, key=lambda point: _distance_km(origin, point))
    max_km = settings.DELIVERY_MAX_DISTANCE_KM
    if max_km and _distance_km(origin, nearest) > max_km:
        raise RouteUnavailableError(
            f"La dirección «{address}» queda a más de {max_km:g} km del local: revisá que esté bien escrita."
        )
    return nearest


def _waypoint(point: tuple[float, float]) -> dict:
    return {"location": {"latLng": {"latitude": point[0], "longitude": point[1]}}}


@dataclass(frozen=True)
class RouteStop:
    # Posición del pedido en la lista de destinos que se consultó.
    index: int
    # Segundos de manejo desde la parada anterior (o desde el local, en la primera).
    leg_seconds: int


def calculate_route(origin: str, destinations: list[str]) -> list[RouteStop]:
    """Paradas en el orden óptimo del recorrido, cada una con el tiempo de manejo desde la anterior."""
    if not settings.GOOGLE_MAPS_API_KEY:
        raise RouteUnavailableError(
            "Google Maps no está configurado: falta GOOGLE_MAPS_API_KEY, así que no se puede calcular la ruta."
        )
    if not destinations:
        return []
    if len(destinations) > MAX_STOPS_PER_TRIP:
        raise RouteUnavailableError(f"Un viaje admite hasta {MAX_STOPS_PER_TRIP} pedidos.")

    origin_results = _search(origin)
    if not origin_results:
        raise RouteUnavailableError("Google Maps no pudo ubicar la dirección del local. Revisala en la configuración.")
    origin_point = _point(origin_results[0])
    area = _area_of(origin_results[0])
    stops_points = [_locate_near(destination, origin_point, area) for destination in destinations]

    body = {
        "origin": _waypoint(origin_point),
        "destination": _waypoint(origin_point),
        "intermediates": [_waypoint(point) for point in stops_points],
        "travelMode": "DRIVE",
        "optimizeWaypointOrder": True,
        "regionCode": settings.GOOGLE_MAPS_REGION,
        "languageCode": "es",
    }
    headers = {
        "X-Goog-Api-Key": settings.GOOGLE_MAPS_API_KEY,
        # La Routes API devuelve solo los campos que se piden.
        "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex,routes.legs.duration",
    }
    try:
        response = httpx.post(settings.GOOGLE_MAPS_ROUTES_URL, json=body, headers=headers, timeout=15.0)
        data = response.json() if response.content else {}
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Error consultando Google Maps: %s", exc)
        raise RouteUnavailableError("No se pudo consultar Google Maps. Probá de nuevo en un momento.") from exc

    if response.status_code != 200:
        error = data.get("error", {}) if isinstance(data, dict) else {}
        status = error.get("status")
        logger.error("Google Maps respondió %s %s: %s", response.status_code, status, error.get("message"))
        if status in ("PERMISSION_DENIED", "UNAUTHENTICATED", "RESOURCE_EXHAUSTED"):
            raise RouteUnavailableError(
                "Google Maps rechazó la consulta (revisá la clave, que la Routes API esté habilitada y la cuota)."
            )
        if status in ("NOT_FOUND", "INVALID_ARGUMENT", "FAILED_PRECONDITION"):
            raise RouteUnavailableError(
                "Google Maps no pudo ubicar alguna de las direcciones del viaje. Revisá las direcciones de los pedidos."
            )
        raise RouteUnavailableError("Google Maps no pudo calcular la ruta del viaje.")

    routes = data.get("routes") if isinstance(data, dict) else None
    if not routes:
        # Sin ruta posible entre los puntos (la API responde vacío).
        raise RouteUnavailableError(
            "Google Maps no pudo ubicar alguna de las direcciones del viaje. Revisá las direcciones de los pedidos."
        )

    try:
        route = routes[0]
        order = route.get("optimizedIntermediateWaypointIndex") or list(range(len(destinations)))
        legs = route["legs"]
        # Hay un tramo por parada más el de la vuelta al local, que no interesa. La duración viene como "123s".
        return [
            RouteStop(index=order[i], leg_seconds=int(float(str(legs[i]["duration"]).rstrip("s"))))
            for i in range(len(destinations))
        ]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        logger.error("Respuesta inesperada de Google Maps: %s", data)
        raise RouteUnavailableError("Google Maps respondió con un formato inesperado.") from exc


def cumulative_eta_minutes(stops: list[RouteStop], tolerance_minutes: int) -> list[int]:
    """Minutos hasta llegar a cada parada desde que sale el repartidor.

    Cada parada suma el manejo hasta ella más la tolerancia de entrega de las paradas anteriores (lo que tarda el
    repartidor en entregar a cada cliente antes de seguir)."""
    etas = []
    elapsed_seconds = 0
    for position, stop in enumerate(stops):
        elapsed_seconds += stop.leg_seconds
        total = elapsed_seconds + position * tolerance_minutes * 60
        etas.append(max(1, math.ceil(total / 60)))
    return etas
