import asyncio
import logging
import time

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings
from app.services.chat_memory import SesionChat
from app.services.tools.horario_tools import obtener_estado_del_local
from app.services.tools.menu_tools import obtener_menu_actual
from app.services.tools.order_tools import calcular_y_preparar_pedido, confirmar_y_guardar_pedido

logger = logging.getLogger(__name__)

LLM_TIMEOUT_SECONDS = 90
MAX_TOOL_ITERATIONS = 8
MENSAJE_FALLBACK_LOOP = "Disculpá, tardé un poquito más de la cuenta en procesarlo. ¿Podés repetirme tu última consulta?"


class ChatService:

    def __init__(self, llm=None):
        self.llm = llm or ChatGoogleGenerativeAI(
            model="gemini-3.5-flash-lite",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.2,
        )
        self.herramientas = [
            calcular_y_preparar_pedido,
            confirmar_y_guardar_pedido,
        ]
        self.herramientas_por_nombre = {h.name: h for h in self.herramientas}
        self.llm_con_herramientas = self.llm.bind_tools(self.herramientas)
        
        self.system_prompt = """
            Sos el asistente virtual de un restaurante local en Telegram. Tu tono es amable, cordial y servicial.
            NOTA IMPORTANTE DE FORMATO: No uses negritas porque no funcionan para destacar o titulos. En su lugar, empeza con un emoji representativo y luego el texto.

            FLUJO OBLIGATORIO DE CONVERSACIÓN:
            1. Saludo inicial: Cuando el cliente salude, dale la bienvenida y preguntale amablemente si querés ver el menú o si prefiere hacer un pedido directamente. (NO uses herramientas en el saludo inicial, solo saluda y pregunta).
            2. Menú: Si el cliente pide ver el menú, presentale el MENÚ ACTUAL que está al final de estas instrucciones, limpio (nombre, precio y categoría), preguntándole qué desea llevar. Nunca ofrezcas productos que no estén en ese menú.
            3. Selección de ítems: Cuando el cliente indique qué quiere comer, usa la herramienta "calcular_y_preparar_pedido" pasando los ítems y cantidades. Muestra el detalle de cada producto con su cantidad, subtotal y el precio total general.
            4. Primera confirmación (Productos): Pregunta claramente si el pedido de productos es correcto. Si dice que no, ajusta. Si dice que sí, pasa al siguiente paso.
            5. Datos de entrega y horario: Pídele su nombre, un teléfono de contacto, si retira por el local o si es envío a domicilio (con dirección) y si desea programar el pedido para una hora en particular o si es para ahora. Preguntale también si quiere agregar alguna observación (ej: sin cebolla, timbre, con cuánto paga).
            6. Segunda confirmación (Resumen completo): Una vez que te dé esos datos, volvé a usar "calcular_y_preparar_pedido" con los productos y todos los datos de entrega: el sistema le muestra al cliente el resumen completo (productos, total y datos de entrega) para que revise todo.
            7. Registro: Solo si el cliente confirma explícitamente que el resumen es correcto, invoca la herramienta "confirmar_y_guardar_pedido". Si dice que no, permítele corregir los datos.
            8. Después del registro: Nunca le digas al cliente que el pedido está confirmado o aceptado: queda pendiente hasta que el local lo revise y le avise por este chat.
            
            REGLA DE HORARIOS: Si el cliente pide un horario, pasáselo a "calcular_y_preparar_pedido" tal cual lo dijo (ej: "21:00"), y si además indica el día (ej: "mañana", "el sábado"), pasalo en "dia_programado". Si la herramienta responde que ese horario es demasiado pronto, decile al cliente cuál es el horario más rápido posible que te indicó y preguntale si lo quiere para esa hora o para ahora. Si responde que el local está cerrado en ese horario (o para ahora), transmitíselo al cliente junto con los horarios de atención y pedile otro horario en el que el local esté abierto. Nunca registres un pedido con un horario (o como "para ahora") que el cliente no haya aceptado.

            REGLA DE OBSERVACIONES: Si en cualquier momento de la conversación el cliente menciona una aclaración importante sobre la comida o la entrega (ej: "sin cebolla", "bien cocida", "es alérgico al maní", "tocar timbre 2B", "pago con $20000"), incluila en "observaciones" aunque no se la hayas preguntado, y no se la vuelvas a pedir.

            REGLA ANTI-REPETICIÓN: Si ya llamaste una herramienta y tienes su resultado disponible, no la vuelvas a llamar con los mismos datos.
        """
        self.sesiones: dict[str, SesionChat] = {}

    def _mensajes_para_el_modelo(self, sesion: SesionChat, menu: str, horario: str = "") -> list:
        # La memoria se recalcula en cada llamada: puede cambiar a mitad de turno tras usar una herramienta.
        horario = f"\n\n{horario}" if horario else ""
        instrucciones = f"{self.system_prompt}{horario}\n\nMENÚ ACTUAL:\n{menu}{sesion.texto_memoria()}"
        return [SystemMessage(content=instrucciones), *sesion.historial]

    async def obtener_respuesta(self, mensaje_usuario: str, session_id: str) -> str:
        sesion = self.sesiones.setdefault(session_id, SesionChat())
        sesion.iniciar_turno(mensaje_usuario)
        try:
            return await self._responder(sesion, session_id)
        finally:
            sesion.finalizar_turno()

    async def _llamar_al_modelo(self, sesion: SesionChat, menu: str, horario: str, session_id: str) -> AIMessage:
        inicio = time.perf_counter()
        respuesta = await asyncio.wait_for(
            self.llm_con_herramientas.ainvoke(self._mensajes_para_el_modelo(sesion, menu, horario)),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        uso = respuesta.usage_metadata or {}
        logger.info(
            "Gemini respondió en %.1f s (tokens: %s de entrada, %s de salida) en sesión %s",
            time.perf_counter() - inicio,
            uso.get("input_tokens", "?"),
            uso.get("output_tokens", "?"),
            session_id,
        )
        return respuesta

    async def _responder(self, sesion: SesionChat, session_id: str) -> str:
        historial = sesion.historial
        menu = obtener_menu_actual()
        horario = obtener_estado_del_local()
        respuesta_ia = None
        try:
            for _ in range(MAX_TOOL_ITERATIONS):
                respuesta_ia = await self._llamar_al_modelo(sesion, menu, horario, session_id)
                historial.append(respuesta_ia)

                if not respuesta_ia.tool_calls:
                    break

                respuesta_directa = None
                for tool_call in respuesta_ia.tool_calls:
                    herramienta = self.herramientas_por_nombre.get(tool_call["name"])
                    if herramienta is None:
                        logger.warning(
                            "El modelo pidió una herramienta inexistente: %s (args=%s) en sesión %s",
                            tool_call["name"],
                            tool_call["args"],
                            session_id,
                        )
                        resultado = f"Herramienta desconocida: {tool_call['name']}"
                    else:
                        try:
                            args = tool_call["args"]
                            if tool_call["name"] == "confirmar_y_guardar_pedido":
                                args = {**args, "telegram_chat_id": session_id}
                            inicio = time.perf_counter()
                            resultado = await herramienta.ainvoke(args)
                            logger.info(
                                "Herramienta %s(%s) ejecutada en %.0f ms en sesión %s",
                                tool_call["name"],
                                tool_call["args"],
                                (time.perf_counter() - inicio) * 1000,
                                session_id,
                            )
                            directa = sesion.registrar_resultado_herramienta(tool_call["name"], str(resultado))
                            if directa:
                                respuesta_directa = directa
                        except Exception:
                            logger.exception("Error ejecutando la herramienta %s", tool_call["name"])
                            resultado = "Ocurrió un error consultando la información."
                    historial.append(ToolMessage(content=str(resultado), tool_call_id=tool_call["id"]))

                if respuesta_directa:
                    # El resumen para confirmar o el aviso de pedido registrado ya están listos para el
                    # cliente: se mandan tal cual, sin otra llamada a Gemini que pueda recortarlos.
                    historial.append(AIMessage(content=respuesta_directa))
                    return respuesta_directa
            else:
                logger.warning(
                    "Se agotó MAX_TOOL_ITERATIONS (%d) en la sesión %s sin respuesta final.",
                    MAX_TOOL_ITERATIONS,
                    session_id,
                )
                return MENSAJE_FALLBACK_LOOP
        except asyncio.TimeoutError:
            logger.error("Timeout esperando respuesta de Gemini para la sesión %s", session_id)
            return MENSAJE_FALLBACK_LOOP

        contenido = respuesta_ia.content

        if isinstance(contenido, list):
            texto_final = "".join(
                parte.get("text", "") for parte in contenido if isinstance(parte, dict) and "text" in parte
            )
        else:
            texto_final = str(contenido)

        if not texto_final.strip():
            texto_final = "Recibí tu mensaje, pero tuve un pequeño inconveniente procesándolo. ¿Podrías repetirme?"

        return texto_final