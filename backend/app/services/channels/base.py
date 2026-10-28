"""Contrato que cumple cada canal de mensajería (Telegram, WhatsApp, ...).

La lógica del bot (conversación, pedidos, derivación a un empleado) no sabe por qué canal habla: solo
recibe y envía texto a través de esta interfaz. Sumar un canal es implementar esta clase y registrarlo.
"""

import asyncio
from abc import ABC, abstractmethod
from typing import ClassVar

import httpx

from app.core.channels import Channel


class ClienteHttpCompartido:
    """Cliente HTTP que reutiliza la conexión con la API del canal (abrir una por envío sumaba ~0,5-1 s).

    Se asocia al event loop en el que se creó, porque una conexión no puede usarse desde otro loop.
    """

    def __init__(self, timeout: float = 30.0) -> None:
        self._timeout = timeout
        self._cliente: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def __call__(self) -> httpx.AsyncClient:
        loop = asyncio.get_running_loop()
        if self._cliente is None or self._cliente.is_closed or self._loop is not loop:
            self._cliente = httpx.AsyncClient(timeout=self._timeout)
            self._loop = loop
        return self._cliente


class CanalDeMensajeria(ABC):
    canal: ClassVar[Channel]
    # Cada cuántos segundos hay que renovar el aviso "escribiendo..." mientras se prepara la respuesta.
    segundos_entre_avisos_de_escritura: ClassVar[float]

    @abstractmethod
    async def enviar_mensaje(self, chat_id: str, texto: str) -> None:
        """Envía un mensaje de texto al chat. Si el envío falla se registra el error, sin propagarlo."""

    @abstractmethod
    async def enviar_escribiendo(self, chat_id: str) -> None:
        """Muestra "escribiendo..." en el chat. Si falla no pasa nada: es solo un indicador visual."""

    async def registrar_webhook(self) -> None:
        """Deja al canal apuntando a este backend, si la plataforma lo permite por API."""
        return None
