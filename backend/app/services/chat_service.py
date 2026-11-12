import asyncio
import logging
import time
from collections.abc import Sequence
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, SystemMessage, ToolCall, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.channels import Channel, split_session_key
from app.core.config import settings
from app.core.phone import normalize_phone
from app.db.session import SessionLocal
from app.services import client_service
from app.services.chat_memory import INACTIVIDAD_PARA_REINICIAR, SesionChat
from app.services.chat_prompt import SYSTEM_PROMPT
from app.services.gemini_models import modelos
from app.services.human_handoff import derivaciones
from app.services.tools.client_tools import MARCA_NOMBRE_GUARDADO, guardar_nombre_del_cliente, limpiar_nombre
from app.services.tools.handoff_tools import derivar_a_empleado
from app.services.tools.horario_tools import obtener_estado_del_local
from app.services.tools.menu_image_tools import enviar_menu_en_imagen
from app.services.tools.menu_tools import obtener_menu_actual
from app.services.tools.order_edit_tools import agregar_items_al_pedido, cambiar_metodo_de_pago
from app.services.tools.order_tools import calcular_y_preparar_pedido, confirmar_y_guardar_pedido
from app.services.tools.promotion_tools import enviar_promociones, obtener_promociones_actuales

logger = logging.getLogger(__name__)

# Tiempo máximo de cada llamada a Gemini: si el primer modelo no responde en ese tiempo se prueba el siguiente
# (ver gemini_models.py), con un poco más de margen. Una respuesta normal tarda de 1 a 5 s; un 503 falla enseguida.
LLM_TIMEOUT_SECONDS = 12
LLM_FALLBACK_TIMEOUT_SECONDS = 20
# Nombre con el que se identifica un modelo inyectado (en los tests): sin respaldo.
MODELO_INYECTADO = "inyectado"
MAX_TOOL_ITERATIONS = 8
MAX_ACTIVE_SESSIONS = 1000
# Se manda cuando el modelo intenta registrar de nuevo un pedido que ya se registró (ej. el cliente sigue escribiendo).
MENSAJE_PEDIDO_YA_REGISTRADO = (
    "Tu pedido ya quedó registrado ✅ (arriba tenés el detalle). "
    "Si querés hacer otro pedido, contame qué te gustaría pedir."
)
# Herramientas que necesitan saber de qué chat viene el cliente (las completa el sistema, no el modelo).
HERRAMIENTAS_DEL_CHAT = (
    "confirmar_y_guardar_pedido",
    "agregar_items_al_pedido",
    "cambiar_metodo_de_pago",
    "guardar_nombre_del_cliente",
    "enviar_menu_en_imagen",
    "enviar_promociones",
)
# Resultado para el modelo cuando quiere registrar un pedido que armó en este mismo turno: el cliente tiene que ver
# el resumen y confirmarlo en su próximo mensaje (el modelo a veces pide calcular y registrar a la vez).
MENSAJE_RESUMEN_SIN_CONFIRMAR = (
    "El pedido NO se registró: el cliente todavía no vio el resumen. Mostráselo y esperá a que lo confirme."
)
MENSAJE_FALLBACK_LOOP = "Disculpá, tardé un poquito más de la cuenta en procesarlo. ¿Podés repetirme tu última consulta?"
MENSAJE_RESPUESTA_VACIA = "Recibí tu mensaje, pero tuve un pequeño inconveniente procesándolo. ¿Podrías repetirme?"


def _con_saludo(sesion: SesionChat, texto: str) -> str:
    """El resumen sale tal cual de la herramienta, sin el saludo del modelo: en el primer mensaje se lo antepone."""
    nombre = sesion.cliente.get("nombre")
    return f"👋 ¡Hola{f', {nombre}' if nombre else ''}!\n\n{texto}"


def _texto_de_la_respuesta(respuesta: AIMessage) -> str:
    """El texto de la respuesta final del modelo (que puede venir en partes), o un aviso si vino vacía."""
    contenido = respuesta.content
    if isinstance(contenido, list):
        texto = "".join(parte.get("text", "") for parte in contenido if isinstance(parte, dict) and "text" in parte)
    else:
        texto = str(contenido)
    return texto if texto.strip() else MENSAJE_RESPUESTA_VACIA


class ChatService:

    def __init__(self, llm=None):
        self.herramientas = [
            calcular_y_preparar_pedido,
            confirmar_y_guardar_pedido,
            agregar_items_al_pedido,
            cambiar_metodo_de_pago,
            guardar_nombre_del_cliente,
            enviar_menu_en_imagen,
            enviar_promociones,
            derivar_a_empleado,
        ]
        self.herramientas_por_nombre = {h.name: h for h in self.herramientas}
        self._llms = self._crear_modelos(llm)
        self._orden_de_modelos = (lambda: [MODELO_INYECTADO]) if llm is not None else modelos.en_orden
        self.system_prompt = SYSTEM_PROMPT
        self.sesiones: dict[str, SesionChat] = {}

    def _crear_modelos(self, llm) -> dict:
        """Los modelos por nombre, con las herramientas ya conectadas."""
        if llm is not None:
            return {MODELO_INYECTADO: llm.bind_tools(self.herramientas)}
        # Sin reintentos internos: si el modelo falla se pasa enseguida al de respaldo (ver _llamar_al_modelo).
        return {
            nombre: ChatGoogleGenerativeAI(
                model=nombre, google_api_key=settings.GOOGLE_API_KEY, temperature=0.2, max_retries=0
            ).bind_tools(self.herramientas)
            for nombre in modelos.en_orden()
        }

    def _mensajes_para_el_modelo(
        self, sesion: SesionChat, menu: str, promociones: str = "", horario: str = ""
    ) -> list:
        # La memoria se recalcula en cada llamada: puede cambiar a mitad de turno tras usar una herramienta.
        horario = f"\n\n{horario}" if horario else ""
        promos = f"\n\nPROMOCIONES ACTUALES:\n{promociones}" if promociones else ""
        instrucciones = f"{self.system_prompt}{horario}\n\nMENÚ ACTUAL:\n{menu}{promos}{sesion.texto_memoria()}"
        return [SystemMessage(content=instrucciones), *sesion.historial]

    def _limpiar_sesiones_inactivas(self) -> None:
        if len(self.sesiones) <= MAX_ACTIVE_SESSIONS:
            return
        ahora = datetime.now(timezone.utc)
        inactivas = [
            sid for sid, s in self.sesiones.items()
            if ahora - s.ultima_actividad > INACTIVIDAD_PARA_REINICIAR
        ]
        for sid in inactivas:
            del self.sesiones[sid]

    @staticmethod
    def _cargar_perfil_del_cliente(sesion: SesionChat, telefono: str) -> None:
        """Busca al cliente en la agenda del local por su teléfono (el del chat de WhatsApp)."""
        db = SessionLocal()
        try:
            cliente = client_service.get_client_by_phone(db, telefono)
            sesion.cargar_perfil(
                normalize_phone(telefono),
                nombre=cliente.full_name if cliente else None,
                direccion=cliente.address if cliente else None,
            )
        except Exception:
            logger.exception("No se pudo consultar el perfil del cliente %s", telefono)
        finally:
            db.close()

    async def obtener_respuesta(self, mensaje_usuario: str, session_id: str) -> str:
        self._limpiar_sesiones_inactivas()
        sesion = self.sesiones.setdefault(session_id, SesionChat())
        sesion.iniciar_turno(mensaje_usuario)
        try:
            canal, chat_id = split_session_key(session_id)
            if canal == Channel.WHATSAPP and not sesion.cliente_consultado:
                await asyncio.to_thread(self._cargar_perfil_del_cliente, sesion, chat_id)
            respuesta = await self._responder(sesion, session_id)
            sesion.registrar_respuesta_del_bot(respuesta)
            # Si en este turno el cliente pidió una persona, el empleado recibe toda la charla previa.
            derivaciones.adjuntar_historial(session_id, sesion.transcripcion)
            return respuesta
        finally:
            sesion.finalizar_turno()

    async def _invocar_modelo(self, modelo: str, intento: int, mensajes: list, session_id: str) -> AIMessage:
        """Una llamada a un modelo de Gemini, con más tiempo si es el de respaldo. Falla si no responde."""
        inicio = time.perf_counter()
        tiempo_maximo = LLM_TIMEOUT_SECONDS if intento == 0 else LLM_FALLBACK_TIMEOUT_SECONDS
        respuesta = await asyncio.wait_for(self._llms[modelo].ainvoke(mensajes), timeout=tiempo_maximo)
        modelos.registrar_exito(modelo)
        uso = respuesta.usage_metadata or {}
        logger.info(
            "Gemini %s respondió en %.1f s (tokens: %s de entrada, %s de salida) en sesión %s",
            modelo,
            time.perf_counter() - inicio,
            uso.get("input_tokens", "?"),
            uso.get("output_tokens", "?"),
            session_id,
        )
        return respuesta

    @staticmethod
    def _registrar_falla_del_modelo(
        modelo: str, intento: int, orden: list[str], error: Exception, session_id: str
    ) -> None:
        """Anota la falla y, si no era el último modelo, avisa que se pasa al siguiente; si era el último, la propaga."""
        modelos.registrar_falla(modelo)
        if intento == len(orden) - 1:
            raise error
        motivo = "no respondió a tiempo" if isinstance(error, asyncio.TimeoutError) else f"falló ({error})"
        logger.warning(
            "Gemini %s %s en sesión %s: se reintenta con %s", modelo, motivo, session_id, orden[intento + 1]
        )

    async def _llamar_al_modelo(
        self, sesion: SesionChat, menu: str, promociones: str, horario: str, session_id: str
    ) -> AIMessage:
        mensajes = self._mensajes_para_el_modelo(sesion, menu, promociones, horario)
        orden = self._orden_de_modelos()
        for intento, modelo in enumerate(orden):
            try:
                return await self._invocar_modelo(modelo, intento, mensajes, session_id)
            except Exception as error:
                self._registrar_falla_del_modelo(modelo, intento, orden, error, session_id)
        raise RuntimeError("No hay modelos de Gemini configurados.")

    @staticmethod
    def _rechazo_de_confirmacion(sesion: SesionChat, session_id: str, herramienta: str) -> tuple[str, str | None] | None:
        """(resultado para el modelo, respuesta directa) si el modelo quiere registrar un pedido que no corresponde."""
        if herramienta != "confirmar_y_guardar_pedido":
            return None
        if sesion.pedido_en_curso is None:
            # Solo se puede registrar un pedido que se armó (calcular_y_preparar_pedido) después del último
            # registrado: si no, un mensaje más del cliente duplicaría el pedido.
            logger.warning("Se evitó registrar dos veces el mismo pedido en la sesión %s", session_id)
            return MENSAJE_PEDIDO_YA_REGISTRADO, MENSAJE_PEDIDO_YA_REGISTRADO
        if sesion.pedido_armado_en_este_turno:
            logger.warning(
                "Se evitó registrar un pedido sin que el cliente viera el resumen en la sesión %s", session_id
            )
            return MENSAJE_RESUMEN_SIN_CONFIRMAR, None
        return None

    @staticmethod
    def _argumentos_de_la_herramienta(sesion: SesionChat, session_id: str, tool_call: ToolCall) -> dict:
        """Los argumentos del modelo más los que completa el sistema (de qué chat viene el cliente)."""
        args = tool_call["args"]
        canal, chat_id = split_session_key(session_id)
        if tool_call["name"] in HERRAMIENTAS_DEL_CHAT:
            return {**args, "canal": canal, "chat_id": chat_id}
        if tool_call["name"] == "derivar_a_empleado":
            return {
                **args,
                "canal": canal,
                "chat_id": chat_id,
                "nombre_cliente": sesion.cliente.get("nombre") or sesion.perfil.get("nombre"),
                "usuario": sesion.perfil.get("usuario"),
                "telefono_cliente": sesion.cliente.get("telefono") or sesion.perfil.get("telefono"),
            }
        return args

    @staticmethod
    def _respuesta_directa_del_resultado(
        sesion: SesionChat, tool_call: ToolCall, resultado: object, primer_turno: bool
    ) -> str | None:
        """Registra lo que devolvió la herramienta en la memoria; devuelve el texto que se le manda tal cual al cliente."""
        nombre = tool_call["name"]
        if nombre == "guardar_nombre_del_cliente" and MARCA_NOMBRE_GUARDADO in str(resultado):
            sesion.recordar_nombre(limpiar_nombre(tool_call["args"].get("nombre")) or "")
        directa = sesion.registrar_resultado_herramienta(nombre, str(resultado))
        if directa and primer_turno and nombre == "calcular_y_preparar_pedido":
            return _con_saludo(sesion, directa)
        return directa or None

    async def _ejecutar_herramienta(
        self, herramienta, sesion: SesionChat, session_id: str, tool_call: ToolCall, primer_turno: bool
    ) -> tuple[str, str | None]:
        """(resultado para el modelo, respuesta directa para el cliente) de una llamada a una herramienta."""
        try:
            args = self._argumentos_de_la_herramienta(sesion, session_id, tool_call)
            inicio = time.perf_counter()
            resultado = await herramienta.ainvoke(args)
            logger.info(
                "Herramienta %s(%s) ejecutada en %.0f ms en sesión %s",
                tool_call["name"],
                tool_call["args"],
                (time.perf_counter() - inicio) * 1000,
                session_id,
            )
            return str(resultado), self._respuesta_directa_del_resultado(sesion, tool_call, resultado, primer_turno)
        except Exception:
            logger.exception("Error ejecutando la herramienta %s", tool_call["name"])
            return "Ocurrió un error consultando la información.", None

    async def _atender_llamada(
        self, sesion: SesionChat, session_id: str, tool_call: ToolCall, primer_turno: bool
    ) -> tuple[str, str | None]:
        """(resultado para el modelo, respuesta directa para el cliente) de lo que pidió el modelo."""
        herramienta = self.herramientas_por_nombre.get(tool_call["name"])
        if herramienta is None:
            logger.warning(
                "El modelo pidió una herramienta inexistente: %s (args=%s) en sesión %s",
                tool_call["name"],
                tool_call["args"],
                session_id,
            )
            return f"Herramienta desconocida: {tool_call['name']}", None
        rechazo = self._rechazo_de_confirmacion(sesion, session_id, tool_call["name"])
        if rechazo:
            return rechazo
        return await self._ejecutar_herramienta(herramienta, sesion, session_id, tool_call, primer_turno)

    async def _atender_llamadas(
        self, sesion: SesionChat, session_id: str, tool_calls: Sequence[ToolCall], primer_turno: bool
    ) -> str | None:
        """Ejecuta las herramientas que pidió el modelo y devuelve la respuesta directa para el cliente, si hay."""
        respuesta_directa = None
        for tool_call in tool_calls:
            resultado, directa = await self._atender_llamada(sesion, session_id, tool_call, primer_turno)
            sesion.historial.append(ToolMessage(content=resultado, tool_call_id=tool_call["id"]))
            respuesta_directa = directa or respuesta_directa
        return respuesta_directa

    async def _paso_de_la_conversacion(
        self, sesion: SesionChat, session_id: str, contexto: tuple[str, str, str], primer_turno: bool
    ) -> str | None:
        """Una vuelta con el modelo: devuelve la respuesta para el cliente, o None si el modelo pidió herramientas
        y hay que volver a consultarlo con sus resultados."""
        menu, promociones, horario = contexto
        respuesta_ia = await self._llamar_al_modelo(sesion, menu, promociones, horario, session_id)
        sesion.historial.append(respuesta_ia)
        if not respuesta_ia.tool_calls:
            return _texto_de_la_respuesta(respuesta_ia)
        respuesta_directa = await self._atender_llamadas(sesion, session_id, respuesta_ia.tool_calls, primer_turno)
        if respuesta_directa:
            # El resumen para confirmar o el aviso de pedido registrado ya están listos para el
            # cliente: se mandan tal cual, sin otra llamada a Gemini que pueda recortarlos.
            sesion.historial.append(AIMessage(content=respuesta_directa))
        return respuesta_directa

    async def _responder(self, sesion: SesionChat, session_id: str) -> str:
        contexto = (obtener_menu_actual(), obtener_promociones_actuales(), obtener_estado_del_local())
        # Primer mensaje de la conversación: si ya trae el pedido, el resumen sale con un saludo (ver _con_saludo).
        primer_turno = not any(isinstance(m, AIMessage) for m in sesion.historial)
        respuesta = None
        vueltas = 0
        try:
            while respuesta is None and vueltas < MAX_TOOL_ITERATIONS:
                respuesta = await self._paso_de_la_conversacion(sesion, session_id, contexto, primer_turno)
                vueltas += 1
        except asyncio.TimeoutError:
            logger.error("Timeout esperando respuesta de Gemini para la sesión %s", session_id)
            return MENSAJE_FALLBACK_LOOP
        if respuesta is None:
            logger.warning(
                "Se agotó MAX_TOOL_ITERATIONS (%d) en la sesión %s sin respuesta final.",
                MAX_TOOL_ITERATIONS,
                session_id,
            )
        return respuesta or MENSAJE_FALLBACK_LOOP
