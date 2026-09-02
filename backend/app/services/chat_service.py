import asyncio
import logging

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings
from app.services.tools.menu_tools import consultar_productos
from app.services.tools.order_tools import calcular_y_preparar_pedido, confirmar_y_guardar_pedido

logger = logging.getLogger(__name__)

LLM_TIMEOUT_SECONDS = 90
MAX_TOOL_ITERATIONS = 4
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

            REGLA ESTRICTA DE TOMA DE PEDIDOS (US-07):
            Paso 1: Cuando el cliente indique qué quiere comer, usá la herramienta "calcular_y_preparar_pedido" pasando los ítems y cantidades. (Deja nombre y dirección en null por ahora).
            Paso 2: Presentale al cliente el resumen de los productos con sus precios exactos calculados por la base de datos.
            Paso 3: INMEDIATAMENTE después de mostrar el resumen de precios, pedile proactivamente su **nombre** y su **dirección de envío**. **NO guardes nada en la base de datos todavía**.
            Paso 4: Una vez que el cliente te dé su nombre y dirección, juntalos con el pedido, volvele a mostrar el resumen completo con el destino y preguntale claramente: "¿Es correcto?".
            Paso 5: 
               - Si el cliente responde afirmativamente ("Sí", "Correcto", "Dale"), **solo en ese momento** invocá la herramienta "confirmar_y_guardar_pedido" para persistirlo en la base de datos.
               - Si el cliente responde con un "No" o quiere cambiar algo, ajustá los datos, recalculá y volvé a pedir confirmación sin guardar nada.
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
                    herramienta = self.herramientas_por_nombre.get(tool_call["name"])
                    if herramienta is None:
                        resultado = f"Herramienta desconocida: {tool_call['name']}"
                    else:
                        try:
                            resultado = await herramienta.ainvoke(tool_call["args"])
                        except Exception:
                            logger.exception("Error ejecutando la herramienta %s", tool_call["name"])
                            resultado = "Ocurrió un error consultando la información."
                    historial.append(ToolMessage(content=str(resultado), tool_call_id=tool_call["id"]))
            else:
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