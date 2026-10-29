"""Memoria de cada conversación del bot: en vez de guardar el chat completo, recuerda los datos
importantes (cliente, pedido en curso, último pedido) y solo los mensajes más recientes."""

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from langchain_core.messages import BaseMessage, HumanMessage

from app.services.human_handoff import AutorMensaje, MensajeDerivacion
from app.services.tools.menu_image_tools import MENSAJE_MENU_ENVIADO
from app.services.tools.order_tools import MARCA_PEDIDO_REGISTRADO

# Mensajes recientes que se le mandan al modelo (cada pregunta del cliente, llamadas a herramientas y respuestas).
MAX_MENSAJES_HISTORIAL = 12
# Tras este tiempo sin mensajes se olvida la charla y el pedido a medio armar, pero no los datos del cliente.
INACTIVIDAD_PARA_REINICIAR = timedelta(hours=2)
# Mensajes que se guardan de toda la charla para mostrársela a un empleado si el cliente pide hablar con uno.
MAX_MENSAJES_TRANSCRIPCION = 200


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
    # Datos del perfil del chat según el canal (nombre, @usuario de Telegram, teléfono de WhatsApp), para que el personal reconozca al cliente.
    perfil: dict[str, str] = field(default_factory=dict)
    # Perfil de la agenda del local (solo WhatsApp, donde el teléfono del chat identifica al cliente).
    telefono_del_canal: str | None = None
    cliente_registrado: bool = False
    cliente_nuevo: bool = False
    cliente_consultado: bool = False
    direccion_habitual: str | None = None
    pedido_en_curso: dict | None = None
    ultimo_pedido: str | None = None
    pedido_registrado_en_este_turno: bool = False
    ultima_actividad: datetime = field(default_factory=_ahora)
    # La charla completa de la sesión (a diferencia del historial, que se recorta para el modelo).
    transcripcion: list[MensajeDerivacion] = field(default_factory=list)

    def _anotar(self, autor: AutorMensaje, texto: str) -> None:
        self.transcripcion.append(MensajeDerivacion(autor, texto))
        del self.transcripcion[:-MAX_MENSAJES_TRANSCRIPCION]

    def registrar_respuesta_del_bot(self, texto: str) -> None:
        self._anotar(AutorMensaje.BOT, texto)

    def iniciar_turno(self, mensaje_usuario: str) -> None:
        if _ahora() - self.ultima_actividad > INACTIVIDAD_PARA_REINICIAR:
            self.historial = []
            self.pedido_en_curso = None
            self.transcripcion = []
            self.cliente_consultado = False  # se vuelve a leer el perfil: el local pudo haberlo editado
        self.ultima_actividad = _ahora()
        self.pedido_registrado_en_este_turno = False
        self.historial.append(HumanMessage(content=mensaje_usuario))
        self._anotar(AutorMensaje.CLIENTE, mensaje_usuario)

    def cargar_perfil(self, telefono: str, nombre: str | None, direccion: str | None) -> None:
        """Datos del cliente según la agenda del local: así no se los pide de nuevo en cada pedido."""
        self.cliente_consultado = True
        self.telefono_del_canal = telefono
        self.cliente_registrado = nombre is not None
        self.cliente_nuevo = nombre is None
        if nombre:
            self.cliente["nombre"] = nombre
        if direccion:
            self.cliente["direccion"] = direccion
            self.direccion_habitual = direccion

    def recordar_nombre(self, nombre: str) -> None:
        """El cliente nuevo dijo su nombre y quedó guardado en su perfil."""
        self.cliente["nombre"] = nombre
        self.cliente_registrado = True
        self.cliente_nuevo = False

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

        elif nombre in ("agregar_items_al_pedido", "cambiar_metodo_de_pago", "guardar_nombre_del_cliente"):
            # El mensaje ya trae los montos y las opciones calculados por el sistema: sale tal cual.
            return resultado

        elif nombre == "enviar_menu_en_imagen" and resultado == MENSAJE_MENU_ENVIADO:
            # La imagen ya salió con su pie de foto: solo queda invitarlo a pedir, sin otra llamada al modelo.
            return resultado

        elif nombre == "derivar_a_empleado":
            # La conversación pasa a una persona: el aviso al cliente sale tal cual, sin otra llamada al modelo.
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
        if self.telefono_del_canal:
            lineas.append(
                "TELÉFONO DE CONTACTO: ya lo tenés, es el número de WhatsApp desde el que escribe "
                f"({self.telefono_del_canal}). Usalo en los pedidos y no se lo pidas."
            )
        if self.cliente_registrado and self.cliente.get("nombre"):
            lineas.append(
                f"CLIENTE CONOCIDO: se llama {self.cliente['nombre']}. En el saludo llamalo por su nombre y no se lo pidas."
            )
        elif self.cliente_nuevo:
            lineas.append(
                "CLIENTE NUEVO: todavía no sabés cómo se llama. Después de saludarlo pedile su nombre y, apenas te lo "
                'diga, usá "guardar_nombre_del_cliente".'
            )
        if self.direccion_habitual:
            lineas.append(
                f"DIRECCIÓN HABITUAL: {self.direccion_habitual}. Si el cliente pide envío a domicilio, preguntale: "
                f'"¿Te lo enviamos a la dirección de siempre: {self.direccion_habitual}?". Si acepta, usala y no le pidas '
                "otra; si la rechaza, pedile la nueva dirección."
            )
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
