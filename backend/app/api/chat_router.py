import uuid

from fastapi import APIRouter
from app.schemas.chat_schemas import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

router = APIRouter()

chat_service = ChatService()

@router.post("/", response_model=ChatResponse)
async def conversar(request: ChatRequest):
    session_id = request.session_id or str(uuid.uuid4())
    respuesta = await chat_service.obtener_respuesta(
        request.mensaje,
        session_id=session_id,
    )
    return ChatResponse(respuesta=respuesta, session_id=session_id)