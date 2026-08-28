import uuid

from fastapi import APIRouter
from app.schemas.chat_schemas import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

# Equivale al @RequestMapping de Spring Boot
router = APIRouter()

# Instanciamos el servicio (Más adelante podés usar Inyección de Dependencias)
chat_service = ChatService()

@router.post("/", response_model=ChatResponse)
async def conversar(request: ChatRequest):
    # Si no mandan session_id, generamos uno nuevo para no mezclar el
    # historial entre distintos clientes de prueba. El caller debe reenviar
    # el session_id devuelto para mantener el contexto en turnos siguientes.
    session_id = request.session_id or str(uuid.uuid4())
    respuesta = await chat_service.obtener_respuesta(
        request.mensaje,
        session_id=session_id,
    )
    return ChatResponse(respuesta=respuesta, session_id=session_id)