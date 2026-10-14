import uuid

from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin
from app.modules.user import User
from app.schemas.chat_schemas import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

router = APIRouter()

chat_service = ChatService()


@router.post("/", response_model=ChatResponse)
async def conversar(request: ChatRequest, current_user: User = Depends(get_current_admin)) -> ChatResponse:
    """Prueba el bot sin pasar por Telegram. Solo para administradores: cada mensaje consume la API de Gemini,
    así que no puede quedar abierto al público."""
    session_id = request.session_id or str(uuid.uuid4())
    respuesta = await chat_service.obtener_respuesta(
        request.mensaje,
        session_id=session_id,
    )
    return ChatResponse(respuesta=respuesta, session_id=session_id)
