"""Qué modelo de Gemini usar en cada llamada: el principal y, si está fallando, los de respaldo.

Gemini a veces deja una petición colgada (decenas de segundos) o responde 503 por alta demanda, y la misma
petición repetida al rato vuelve en un segundo; además cada modelo se cae por su lado (mientras uno responde 503
otro anda bien). Por eso cada llamada tiene un tiempo máximo corto y, si el modelo principal no responde, se pasa a
los de respaldo. Después de una falla del principal se empieza un rato por los respaldos, para no pagar la espera en
cada mensaje mientras dura el problema. Lo usan el chat y la transcripción
de audios, así una falla vista en uno también la aprovecha el otro.
"""

import logging
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

# Cuánto se sigue empezando por el respaldo después de una falla del modelo principal.
SEGUNDOS_EN_RESPALDO = 120


class SelectorDeModelos:
    def __init__(self) -> None:
        self._respaldo_hasta = 0.0

    @property
    def principal(self) -> str:
        return settings.BOT_LLM_MODEL

    @property
    def respaldos(self) -> list[str]:
        nombres = (nombre.strip() for nombre in settings.BOT_LLM_FALLBACK_MODELS.split(","))
        return list(dict.fromkeys(n for n in nombres if n and n != self.principal))

    def en_orden(self) -> list[str]:
        """Modelos a probar, en orden: el principal primero, salvo que haya fallado hace poco."""
        if time.monotonic() < self._respaldo_hasta:
            return [*self.respaldos, self.principal]
        return [self.principal, *self.respaldos]

    def registrar_falla(self, modelo: str) -> None:
        if modelo != self.principal or not self.respaldos:
            return
        if time.monotonic() >= self._respaldo_hasta:
            logger.warning(
                "Gemini %s no está respondiendo: se usan primero %s durante %d s.",
                self.principal,
                ", ".join(self.respaldos),
                SEGUNDOS_EN_RESPALDO,
            )
        self._respaldo_hasta = time.monotonic() + SEGUNDOS_EN_RESPALDO

    def registrar_exito(self, modelo: str) -> None:
        if modelo == self.principal:
            self._respaldo_hasta = 0.0


modelos = SelectorDeModelos()
