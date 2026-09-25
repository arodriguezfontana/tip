import asyncio
import logging

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings
from app.services.tools.menu_tools import consultar_productos
from app.services.tools.order_tools import calcular_y_preparar_pedido, confirmar_y_guardar_pedido

logger = logging.getLogger(__name__)

LLM_TIMEOUT_SECONDS = 90
MAX_TOOL_ITERATIONS = 8
MENSAJE_FALLBACK_LOOP = "Disculpá, tardé un poquito más de la cuenta en procesarlo. ¿Podés repetirme tu última consulta?"


class ChatService:

    def __init__(self):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-3.5-flash-lite",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.2,
        )
        self.herramientas = [
            consultar_productos,
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
            2. Menú: Si el cliente pide ver el menú, usa obligatoriamente la herramienta "consultar_productos" y preséntaselo limpio (nombre, precio y categoría, sin descripciones largas), preguntándole qué desea llevar.
            3. Selección de ítems: Cuando el cliente indique qué quiere comer, usa la herramienta "calcular_y_preparar_pedido" pasando los ítems y cantidades. Muestra el detalle de cada producto con su cantidad, subtotal y el precio total general.
            4. Primera confirmación (Productos): Pregunta claramente si el pedido de productos es correcto. Si dice que no, ajusta. Si dice que sí, pasa al siguiente paso.
            5. Datos de entrega y horario: Pídele su nombre, si retira por el local o si es envío a domicilio (con dirección). Pregúntale también si desea programar el pedido para una hora en particular o si es para ahora.
            6. Segunda confirmación (Datos de envío): Una vez que te dé esos datos, muéstrale un breve resumen exclusivo de los datos de entrega (nombre, método, dirección y horario) y pregúntale: "¿Están bien estos datos?".
            7. Registro: Solo si el cliente confirma explícitamente que los datos de envío son correctos, invoca la herramienta "confirmar_y_guardar_pedido". Si dice que no, permítele corregir los datos.
            8. Mensaje final: Tras guardarse con éxito, despide al cliente con un texto fluido y cálido (ej: indicando que se registró con éxito y agradeciendo), sin mostrar IDs técnicos.
            
            REGLA ANTI-REPETICIÓN: Si ya llamaste una herramienta y tienes su resultado disponible, no la vuelvas a llamar con los mismos datos.
        """
        self.sesiones = {}

    async def obtener_respuesta(self, mensaje_usuario: str, session_id: str) -> str:
        if session_id not in self.sesiones:
            self.sesiones[session_id] = [
                SystemMessage(content=self.system_prompt)
            ]

        historial = self.sesiones[session_id]
        historial.append(HumanMessage(content=mensaje_usuario))

        respuesta_ia = None
        try:
            for _ in range(MAX_TOOL_ITERATIONS):
                respuesta_ia = await asyncio.wait_for(
                    self.llm_con_herramientas.ainvoke(historial),
                    timeout=LLM_TIMEOUT_SECONDS,
                )
                historial.append(respuesta_ia)

                if not respuesta_ia.tool_calls:
                    break

                for tool_call in respuesta_ia.tool_calls:
                    logger.info(
                        "Tool call: %s(%s) en sesión %s", tool_call["name"], tool_call["args"], session_id
                    )
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
                            resultado = await herramienta.ainvoke(args)
                        except Exception:
                            logger.exception("Error ejecutando la herramienta %s", tool_call["name"])
                            resultado = "Ocurrió un error consultando la información."
                    historial.append(ToolMessage(content=str(resultado), tool_call_id=tool_call["id"]))
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