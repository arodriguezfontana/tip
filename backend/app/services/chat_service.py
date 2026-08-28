import asyncio
import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.core.config import settings

logger = logging.getLogger(__name__)

LLM_TIMEOUT_SECONDS = 60


class ChatService:

    def __init__(self):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-3.5-flash-lite",
            google_api_key=settings.GOOGLE_API_KEY,
            temperature=0.2,
        )
        self.system_prompt = """
            Sos el asistente virtual de un restaurante local. Tu tono es amable, cordial y servicial.
            Tu objetivo es saludar a los clientes y responder preguntas generales.

            REGLA IMPORTANTE: Actualmente estás en fase de entrenamiento. 
            Si un cliente intenta realizar un pedido de comida, debés explicarle con amabilidad 
            que por el momento no podés procesar órdenes reales y pedirle disculpas.
        """
        self.sesiones = {}

    async def obtener_respuesta(self, mensaje_usuario: str, session_id: str) -> str:
        """Envía el historial al modelo de IA y retorna la respuesta procesada en texto."""
        if session_id not in self.sesiones:
            self.sesiones[session_id] = [
                SystemMessage(content=self.system_prompt)
            ]

        self.sesiones[session_id].append(HumanMessage(content=mensaje_usuario))

        respuesta_ia = await asyncio.wait_for(
            self.llm.ainvoke(self.sesiones[session_id]),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        contenido = respuesta_ia.content

        if isinstance(contenido, list):
            texto_final = contenido[0].get("text", "")
        else:
            texto_final = str(contenido)

        self.sesiones[session_id].append(AIMessage(content=texto_final))

        return texto_final