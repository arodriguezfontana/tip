import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api import (
    auth_router,
    business_hours_router,
    category_router,
    chat_router,
    client_router,
    customer_router,
    delivery_driver_router,
    ingredient_router,
    menu_router,
    order_router,
    product_router,
    stats_router,
    store_config_router,
    telegram_router,
)
from app.api.errors import register_error_handlers
from app.core.config import settings
from app.db.session import get_db
from app.services.telegram_service import register_webhook

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await register_webhook()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

register_error_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
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
api_router.include_router(business_hours_router.router, prefix="/business-hours", tags=["Business hours"])
api_router.include_router(category_router.router, prefix="/categories", tags=["Categories"])
api_router.include_router(chat_router.router, prefix="/chat", tags=["Chatbot"])
api_router.include_router(client_router.router, prefix="/clients", tags=["Clients"])
api_router.include_router(customer_router.router, prefix="/customers", tags=["Customers"])
api_router.include_router(delivery_driver_router.router, prefix="/delivery-drivers", tags=["Delivery Drivers"])
api_router.include_router(ingredient_router.router, prefix="/ingredients", tags=["Ingredients"])
api_router.include_router(menu_router.router, prefix="/menu", tags=["Menu"])
api_router.include_router(product_router.router, prefix="/products", tags=["Products"])
api_router.include_router(order_router.router, prefix="/orders", tags=["Orders"])
api_router.include_router(telegram_router.router, prefix="/telegram", tags=["Telegram"])
api_router.include_router(stats_router.router, prefix="/stats", tags=["Stats"])
api_router.include_router(store_config_router.router, prefix="/store-config", tags=["Store Config"])

app.include_router(api_router)


@app.get("/")
def read_root():
    return {"message": f"Bienvenido a la API de {settings.PROJECT_NAME}"}
