"""Memoria de cada conversación del bot: en vez de guardar el chat completo, recuerda los datos
importantes (cliente, pedido en curso, último pedido) y solo los mensajes más recientes."""

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from langchain_core.messages import BaseMessage, HumanMessage

from app.services.tools.order_tools import MARCA_PEDIDO_REGISTRADO

# Mensajes recientes que se le mandan al modelo (cada pregunta del cliente, llamadas a herramientas y respuestas).
MAX_MENSAJES_HISTORIAL = 12
# Tras este tiempo sin mensajes se olvida la charla y el pedido a medio armar, pero no los datos del cliente.
INACTIVIDAD_PARA_REINICIAR = timedelta(hours=2)


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _desde_ultimo_turno(historial: list[BaseMessage]) -> list[BaseMessage]:
    """Mensajes a partir del último mensaje del cliente (nunca deja un resultado de herramienta huérfano)."""
    for indice in range(len(historial) - 1, -1, -1):
        if isinstance(historial[indice], HumanMessage):
            return historial[indice:]
    return []


def _describir_items(pedido: dict) -> str:
    return ", ".join(
        f"{item.get('quantity', 1)}x {item.get('nombre') or 'producto #' + str(item.get('product_id'))}"
        for item in pedido.get("items", [])
    )


@dataclass
class SesionChat:
    historial: list[BaseMessage] = field(default_factory=list)
    cliente: dict[str, str] = field(default_factory=dict)
    pedido_en_curso: dict | None = None
    ultimo_pedido: str | None = None
    pedido_registrado_en_este_turno: bool = False
    ultima_actividad: datetime = field(default_factory=_ahora)

    def iniciar_turno(self, mensaje_usuario: str) -> None:
        if _ahora() - self.ultima_actividad > INACTIVIDAD_PARA_REINICIAR:
            self.historial = []
            self.pedido_en_curso = None
        self.ultima_actividad = _ahora()
        self.pedido_registrado_en_este_turno = False
        self.historial.append(HumanMessage(content=mensaje_usuario))

    def registrar_resultado_herramienta(self, nombre: str, resultado: str) -> str | None:
        """Extrae de los resultados de las herramientas lo que vale la pena recordar.

        Devuelve el mensaje para mandarle al cliente tal cual, sin pasar por el modelo, cuando el
        resultado ya es la respuesta final: el resumen completo para confirmar o el pedido registrado.
        """
        if nombre == "calcular_y_preparar_pedido":
            try:
                respuesta = json.loads(resultado)
                datos = respuesta["datos_temporales"]
            except (ValueError, KeyError, TypeError):
                return None
            self.pedido_en_curso = datos
            if datos.get("cliente"):
                self.cliente["nombre"] = datos["cliente"]
            if datos.get("telefono"):
                self.cliente["telefono"] = datos["telefono"]
            if datos.get("metodo_entrega") == "domicilio" and datos.get("direccion"):
                self.cliente["direccion"] = datos["direccion"]
            if not datos.get("faltan_datos"):
                return respuesta.get("mensaje_para_usuario")

        elif nombre == "confirmar_y_guardar_pedido" and MARCA_PEDIDO_REGISTRADO in resultado:
            if self.pedido_en_curso:
                horario = self.pedido_en_curso.get("hora_programada")
                dia = self.pedido_en_curso.get("dia_programado")
                cuando = f"para las {horario}{f' del {dia}' if dia else ''}" if horario else "para ahora"
                self.ultimo_pedido = (
                    f"{_describir_items(self.pedido_en_curso)} ({cuando}), "
                    "registrado y pendiente de que el local lo confirme"
                )
            self.pedido_en_curso = None
            self.pedido_registrado_en_este_turno = True
            return resultado

        return None

    def finalizar_turno(self) -> None:
        if self.pedido_registrado_en_este_turno:
            # El pedido ya quedó guardado: la charla que lo armó no hace falta, solo este último intercambio.
            self.historial = _desde_ultimo_turno(self.historial)
        elif len(self.historial) > MAX_MENSAJES_HISTORIAL:
            recortado = self.historial[-MAX_MENSAJES_HISTORIAL:]
            inicio = next((i for i, m in enumerate(recortado) if isinstance(m, HumanMessage)), None)
            self.historial = recortado[inicio:] if inicio is not None else _desde_ultimo_turno(self.historial)

    def texto_memoria(self) -> str:
        lineas = []
        if self.cliente:
            etiquetas = {"nombre": "Nombre", "telefono": "Teléfono", "direccion": "Dirección de envío"}
            lineas.append(
                "DATOS DEL CLIENTE (ya los dio antes: no se los vuelvas a pedir, proponéselos para que "
                "los confirme o corrija):"
            )
            lineas += [f"- {etiquetas[clave]}: {valor}" for clave, valor in self.cliente.items()]
        if self.pedido_en_curso:
            lineas.append(
                f"PEDIDO EN CURSO ({_describir_items(self.pedido_en_curso)}). Datos a usar en "
                f"confirmar_y_guardar_pedido: {json.dumps(self.pedido_en_curso, ensure_ascii=False)}"
            )
        if self.ultimo_pedido:
            lineas.append(f"ÚLTIMO PEDIDO DEL CLIENTE: {self.ultimo_pedido}.")
        if not lineas:
            return ""
        return "\n\nMEMORIA DE LA CONVERSACIÓN:\n" + "\n".join(lineas)
