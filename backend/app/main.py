import logging

from fastapi import Depends, FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.api import auth_router
from app.api import chat_router
from app.api import menu_router
from app.api import order_router
from app.api import telegram_router
from app.api import stats_router  # Corregido el path relativo de importación

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix=settings.API_V1_STR)


@api_router.get("/health-check")
def health_check(db: Session = Depends(get_db)):
    """Endpoint para verificar la conexión correcta con la base de datos PostgreSQL."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "Conectada correctamente"}
    except Exception as e:
        return {"status": "error", "database": f"Error de conexión: {e!s}"}

api_router.include_router(auth_router.router, prefix="/auth", tags=["Auth"])
api_router.include_router(chat_router.router, prefix="/chat", tags=["Chatbot"])
api_router.include_router(menu_router.router, prefix="/menu", tags=["Menu"])
api_router.include_router(order_router.router, prefix="/orders", tags=["Orders"])
api_router.include_router(telegram_router.router, prefix="/telegram", tags=["Telegram"])
api_router.include_router(stats_router.router, prefix="/stats", tags=["Stats"])  

app.include_router(api_router)


@app.get("/")
def read_root():
    return {"message": f"Bienvenido a la API de {settings.PROJECT_NAME}"}