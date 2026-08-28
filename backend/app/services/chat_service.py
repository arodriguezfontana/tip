import asyncio
import logging

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings
from app.services.tools.menu_tools import consultar_productos

logger = logging.getLogger(__name__)

LLM_TIMEOUT_SECONDS = 60
MAX_TOOL_ITERATIONS = 3
MENSAJE_FALLBACK_LOOP = "Disculpá, no pude terminar de procesar tu consulta. ¿Podés reformularla?"


class ChatService:

    def __init__(self):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-3.5-flash-lite",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.2,
        )
        self.herramientas = [consultar_productos]
        self.herramientas_por_nombre = {h.name: h for h in self.herramientas}
        self.llm_con_herramientas = self.llm.bind_tools(self.herramientas)
        self.system_prompt = """
            Sos el asistente virtual de un restaurante local. Tu tono es amable, cordial y servicial.
            Tu objetivo es saludar a los clientes y responder preguntas generales.

            REGLA IMPORTANTE: Actualmente estás en fase de entrenamiento.
            Si un cliente intenta realizar un pedido de comida, debés explicarle con amabilidad
            que por el momento no podés procesar órdenes reales y pedirle disculpas.

            REGLA SOBRE EL MENÚ: cuando el cliente pregunte por productos, el menú, precios
            o disponibilidad, SIEMPRE usá la herramienta "consultar_productos" para traer la
            información real antes de responder. Nunca inventes productos, precios ni
            descripciones que la herramienta no haya devuelto. Si la herramienta no encuentra
            nada, decíselo con sinceridad al cliente en vez de inventar una respuesta.
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

        contenido = respuesta_ia.content

        if isinstance(contenido, list):
            texto_final = contenido[0].get("text", "") if contenido else ""
        else:
            texto_final = str(contenido)

        return texto_final