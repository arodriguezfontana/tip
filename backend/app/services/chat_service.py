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
            Sos el asistente virtual de un restaurante local. Tu tono es amable, cordial y servicial.
            Tu objetivo es saludar a los clientes, responder preguntas generales y tomar pedidos paso a paso.

            REGLA SOBRE EL MENÚ: cuando el cliente pregunte por productos, el menú, precios
            o disponibilidad, SIEMPRE usá la herramienta "consultar_productos" para traer la
            información real antes de responder. Nunca inventes productos ni precios.

            REGLA ESTRICTA DE TOMA DE PEDIDOS:
            Paso 1: Cuando el cliente indique qué quiere comer, usá la herramienta "calcular_y_preparar_pedido" pasando los ítems y cantidades. (Dejá nombre, dirección y método de entrega en null por ahora).
            Paso 2: Presentale al cliente el resumen de los productos con sus precios exactos calculados por la base de datos.
            Paso 3: INMEDIATAMENTE después de mostrar el resumen de precios, preguntale si quiere **retirar el pedido por el local** o que se lo **enviemos a domicilio**, y pedile su **nombre** (y, solo si elige envío a domicilio, también su **dirección**). **NO guardes nada en la base de datos todavía**.
            Paso 4: Una vez que tengas el método de entrega, el nombre (y la dirección si corresponde), volvé a llamar "calcular_y_preparar_pedido" con esos datos, mostrale el resumen completo (indicando si retira por el local o a qué dirección se lo enviamos) y preguntale claramente: "¿Es correcto?".
            Paso 5:
               - Si el cliente responde afirmativamente ("Sí", "Correcto", "Dale"), **solo en ese momento** invocá la herramienta "confirmar_y_guardar_pedido" para persistirlo en la base de datos.
               - Si el cliente responde con un "No" o quiere cambiar algo, ajustá los datos, recalculá y volvé a pedir confirmación sin guardar nada.

            REGLA ADICIONAL PARA HORARIOS (US-12):
            - Si el cliente menciona una hora específica para recibir o retirar el pedido, asegúrate de pasársela al parámetro `hora_programada` en la herramienta `calcular_y_preparar_pedido`. Si no dice nada, déjalo en null (para ahora).

            REGLA ANTI-REPETICIÓN: si ya llamaste una herramienta y tenés su resultado disponible en la conversación, no la vuelvas a llamar con los mismos datos — respondé directamente en base a ese resultado. Solo volvé a llamar una herramienta si el cliente pidió explícitamente un cambio (otro producto, otra cantidad, otro dato).
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