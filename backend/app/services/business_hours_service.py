"""Horarios de atención del local: su configuración y el cálculo de si el local está abierto.

Las franjas se manejan en "minutos de la semana" (0 = lunes 00:00) para que las que pasan la
medianoche (ej. sábado de 20:00 a 02:00, o domingo a lunes) se comparen igual que las demás.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.core.time import ahora_local
from app.modules.business_hours import BusinessHours

MINUTOS_POR_DIA = 24 * 60
MINUTOS_POR_SEMANA = 7 * MINUTOS_POR_DIA

DIAS_SEMANA = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")


class HorarioInvalidoError(ValueError):
    """La configuración de horarios enviada no es válida."""


class LocalCerradoError(Exception):
    """Se intentó hacer un pedido para ahora con el local cerrado."""


@dataclass(frozen=True)
class Franja:
    dia: int  # 0 = lunes ... 6 = domingo
    apertura: time
    cierre: time

    @property
    def inicio(self) -> int:
        return self.dia * MINUTOS_POR_DIA + self.apertura.hour * 60 + self.apertura.minute

    @property
    def fin(self) -> int:
        """Minuto de la semana en que cierra (puede pasarse de la semana si cruza el domingo a la noche)."""
        duracion = (_minutos(self.cierre) - _minutos(self.apertura)) % MINUTOS_POR_DIA
        return self.inicio + duracion

    def describir(self) -> str:
        return f"{self.apertura:%H:%M} a {self.cierre:%H:%M}"


@dataclass(frozen=True)
class EstadoLocal:
    franjas: list[Franja]
    abierto: bool
    cierra_a: datetime | None
    proxima_apertura: datetime | None
    ahora: datetime

    @property
    def configurado(self) -> bool:
        return bool(self.franjas)

    @property
    def descripcion_proxima_apertura(self) -> str | None:
        if self.proxima_apertura is None:
            return None
        return describir_momento(self.proxima_apertura, self.ahora, con_fecha=False)


def _minutos(hora: time) -> int:
    return hora.hour * 60 + hora.minute


def _minuto_de_la_semana(momento: datetime) -> int:
    return momento.weekday() * MINUTOS_POR_DIA + momento.hour * 60 + momento.minute


def obtener_franjas(db: Session) -> list[Franja]:
    filas = db.query(BusinessHours).order_by(BusinessHours.day_of_week, BusinessHours.opens_at).all()
    return [Franja(dia=f.day_of_week, apertura=f.opens_at, cierre=f.closes_at) for f in filas]


def validar_franjas(franjas: list[Franja]) -> None:
    if not franjas:
        raise HorarioInvalidoError("Cargá al menos una franja horaria de atención.")

    for franja in franjas:
        if not 0 <= franja.dia <= 6:
            raise HorarioInvalidoError("Día de la semana inválido.")
        if franja.apertura == franja.cierre:
            raise HorarioInvalidoError(
                f"La franja del {DIAS_SEMANA[franja.dia]} tiene la misma hora de apertura y de cierre."
            )

    ordenadas = sorted(franjas, key=lambda f: f.inicio)
    for indice, actual in enumerate(ordenadas):
        # La última se compara con la primera de la semana siguiente, por si cruza del domingo al lunes.
        es_la_ultima = indice == len(ordenadas) - 1
        siguiente = ordenadas[0] if es_la_ultima else ordenadas[indice + 1]
        inicio_siguiente = siguiente.inicio + (MINUTOS_POR_SEMANA if es_la_ultima else 0)
        if actual.fin > inicio_siguiente:
            raise HorarioInvalidoError(
                f"La franja del {DIAS_SEMANA[actual.dia]} de {actual.describir()} se superpone con "
                f"la del {DIAS_SEMANA[siguiente.dia]} de {siguiente.describir()}."
            )


def guardar_franjas(db: Session, franjas: list[Franja]) -> list[Franja]:
    """Reemplaza todos los horarios de atención por los indicados."""
    validar_franjas(franjas)
    try:
        db.query(BusinessHours).delete()
        db.add_all(BusinessHours(day_of_week=f.dia, opens_at=f.apertura, closes_at=f.cierre) for f in franjas)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return obtener_franjas(db)


def _franja_que_contiene(franjas: list[Franja], momento: datetime) -> tuple[Franja, int] | None:
    """Franja abierta en ese momento y el minuto de la semana (ajustado si cruzó el domingo) en que cae."""
    minuto = _minuto_de_la_semana(momento)
    for franja in franjas:
        for candidato in (minuto, minuto + MINUTOS_POR_SEMANA):
            if franja.inicio <= candidato < franja.fin:
                return franja, candidato
    return None


def esta_abierto(franjas: list[Franja], momento: datetime) -> bool:
    """Si no hay horarios configurados, el local no restringe pedidos."""
    return not franjas or _franja_que_contiene(franjas, momento) is not None


def _al_minuto(momento: datetime) -> datetime:
    return momento.replace(second=0, microsecond=0)


def hora_de_cierre(franjas: list[Franja], momento: datetime) -> datetime | None:
    encontrada = _franja_que_contiene(franjas, momento)
    if encontrada is None:
        return None
    franja, minuto = encontrada
    return _al_minuto(momento) + timedelta(minutes=franja.fin - minuto)


def proxima_apertura(franjas: list[Franja], momento: datetime) -> datetime | None:
    if not franjas:
        return None
    minuto = _minuto_de_la_semana(momento)
    faltan = min((f.inicio - minuto) % MINUTOS_POR_SEMANA or MINUTOS_POR_SEMANA for f in franjas)
    return _al_minuto(momento) + timedelta(minutes=faltan)


def estado_del_local(db: Session, ahora: datetime | None = None) -> EstadoLocal:
    ahora = ahora or ahora_local()
    franjas = obtener_franjas(db)
    abierto = esta_abierto(franjas, ahora)
    return EstadoLocal(
        franjas=franjas,
        abierto=abierto,
        cierra_a=hora_de_cierre(franjas, ahora) if abierto else None,
        proxima_apertura=None if abierto else proxima_apertura(franjas, ahora),
        ahora=ahora,
    )


def describir_momento(momento: datetime, ahora: datetime, con_fecha: bool = True) -> str:
    """'hoy a las 20:00', 'mañana a las 20:00' o 'el martes (13/10) a las 20:00'."""
    dias = (momento.date() - ahora.date()).days
    if dias == 0:
        dia = "hoy"
    elif dias == 1:
        dia = "mañana"
    else:
        dia = f"el {DIAS_SEMANA[momento.weekday()]}"
        if con_fecha:
            dia += f" {momento:%d/%m}"
    return f"{dia} a las {momento:%H:%M}"


def describir_horarios(franjas: list[Franja]) -> list[str]:
    """Una línea por día de la semana, ej. 'Lunes: 12:00 a 15:00 y 20:00 a 00:00' o 'Martes: cerrado'."""
    lineas = []
    for dia, nombre in enumerate(DIAS_SEMANA):
        del_dia = [f.describir() for f in franjas if f.dia == dia]
        lineas.append(f"{nombre.capitalize()}: {' y '.join(del_dia) if del_dia else 'cerrado'}")
    return lineas


def mensaje_local_cerrado(estado: EstadoLocal) -> str:
    mensaje = "El local está cerrado en este momento, así que no podemos tomar pedidos."
    if estado.descripcion_proxima_apertura:
        mensaje += f" Volvemos a abrir {estado.descripcion_proxima_apertura}."
    return mensaje


def verificar_local_abierto(db: Session, ahora: datetime | None = None) -> None:
    estado = estado_del_local(db, ahora)
    if not estado.abierto:
        raise LocalCerradoError(mensaje_local_cerrado(estado))


def proxima_fecha_abierta_a_la_hora(
    franjas: list[Franja], desde: date, hora: time, tzinfo, max_dias: int
) -> datetime | None:
    """Primer día a partir del siguiente a `desde` (hasta `max_dias`) en el que el local está abierto a esa hora."""
    for dias in range(1, max_dias + 1):
        candidato = datetime.combine(desde + timedelta(days=dias), hora, tzinfo=tzinfo)
        if esta_abierto(franjas, candidato):
            return candidato
    return None
