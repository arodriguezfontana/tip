from pydantic import BaseModel

class ChatRequest(BaseModel):
    mensaje: str
    session_id: str | None = None

class ChatResponse(BaseModel):
    respuesta: str
    session_id: str