"""
Servicio de IA para manejar la conversación del chatbot gastronómico.
Utiliza LangChain y Gemini para procesar los mensajes.
"""

import asyncio
import logging

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

logger = logging.getLogger(__name__)

# Margen bajo los 20s del CA de respuesta, dejando tiempo para el envío a Telegram.
LLM_TIMEOUT_SECONDS = 15

class ChatService:
    """
    Clase encargada de gestionar la conexión con Gemini y la personalidad del bot.
    """

    def __init__(self):
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-3.5-flash-lite",
            temperature=0.7
        )
        self.system_prompt = """
        Sos el asistente virtual de un restaurante local. Tu tono es amable, cordial y servicial.
        Tu objetivo es saludar a los clientes y responder preguntas generales.

        REGLA IMPORTANTE: Actualmente estás en fase de entrenamiento. 
        Si un cliente intenta realizar un pedido de comida, debés explicarle con amabilidad 
        que por el momento no podés procesar órdenes reales y pedirle disculpas.
        """
        # Diccionario para guardar el historial de cada cliente
        self.sesiones = {}

    async def obtener_respuesta(self, mensaje_usuario: str, session_id: str) -> str:
        """
        Envía el historial al modelo de IA y retorna la respuesta procesada en texto.
        """
        # Si es la primera vez que habla este usuario, inicializamos su historial
        if session_id not in self.sesiones:
            self.sesiones[session_id] = [SystemMessage(content=self.system_prompt)]
        
        # 1. Agregamos el nuevo mensaje del usuario al historial
        self.sesiones[session_id].append(HumanMessage(content=mensaje_usuario))

        # 2. Le pasamos TODO el historial a Gemini para que tenga contexto,
        # con un timeout para no violar el SLA de respuesta.
        respuesta_ia = await asyncio.wait_for(
            self.llm.ainvoke(self.sesiones[session_id]),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        contenido = respuesta_ia.content
        
        # 3. Extraemos el texto limpio
        if isinstance(contenido, list):
            texto_final = contenido[0].get("text", "")
        else:
            texto_final = str(contenido)
            
        # 4. Guardamos la respuesta del bot en el historial para el futuro
        self.sesiones[session_id].append(AIMessage(content=texto_final))
            
        return texto_final