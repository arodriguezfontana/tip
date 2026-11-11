import hashlib
import re

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.channels import Channel

# Variables de configuración que necesita cada canal para funcionar.
_CREDENCIALES_POR_CANAL = {
    Channel.TELEGRAM: ("TELEGRAM_TOKEN",),
    Channel.WHATSAPP: (
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_VERIFY_TOKEN",
        "WHATSAPP_APP_SECRET",
    ),
}


class Settings(BaseSettings):
    PROJECT_NAME: str = "TIP"
    API_V1_STR: str = "/api/v1"
    # Orígenes del frontend habilitados (CORS). Por variable de entorno se pasa como lista JSON.
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "root"
    POSTGRES_DB: str = "tip"
    DATABASE_URL: str = ""

    # Canales por los que atiende el bot, separados por coma (ej. "telegram", "whatsapp" o "telegram,whatsapp").
    # Cambiar de canal es cambiar este valor; cada canal habilitado exige sus credenciales (ver abajo).
    BOT_CHANNELS: str = "telegram"

    TELEGRAM_TOKEN: str = ""
    GOOGLE_API_KEY: str
    # Si no se configura, se usa uno derivado del token del bot (ver telegram_webhook_secret).
    TELEGRAM_WEBHOOK_SECRET: str = ""
    # URL pública fija del backend (ej. el dominio estático de ngrok). Si está, el webhook
    # de Telegram se registra solo al levantar la API.
    PUBLIC_URL: str = ""

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    # La sesión del admin dura 30 días y el panel la renueva sola mientras está abierto.
    ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30

    ADMIN_EMAIL: str
    ADMIN_PASSWORD: str
    ADMIN_PIN: str = "1234"

    # WhatsApp Business Platform (Cloud API oficial de Meta). Ver backend/docs/whatsapp.md.
    WHATSAPP_ACCESS_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    # Texto que uno elige y carga también en Meta al configurar el webhook (verificación inicial, GET).
    WHATSAPP_VERIFY_TOKEN: str = ""
    # "Clave secreta" de la app de Meta: con ella se comprueba la firma de cada mensaje que llega.
    WHATSAPP_APP_SECRET: str = ""
    WHATSAPP_API_VERSION: str = "v21.0"

    # Los mensajes que un cliente manda seguidos al bot se esperan este tiempo y se responden juntos, de una vez.
    # La espera se reinicia con cada mensaje nuevo, hasta el tope máximo desde el primero del grupo.
    # Los tiempos de espera de mensajes seguidos de dev (5 s y 15 s), más los modelos de Gemini del bot.
    BOT_BATCH_WINDOW_SECONDS: float = 5.0
    BOT_BATCH_MAX_WAIT_SECONDS: float = 15.0

    # Modelos de Gemini del bot (chat y transcripción de mensajes de voz, con la misma GOOGLE_API_KEY), todos del
    # plan gratuito. Si el principal no responde a tiempo o falla, se prueban los de respaldo en orden (separados
    # por coma; vacío: sin respaldo). Cada modelo tiene su propia cuota gratuita. Ver gemini_models.py.
    BOT_LLM_MODEL: str = "gemini-3.5-flash-lite"
    BOT_LLM_FALLBACK_MODELS: str = "gemini-flash-lite-latest,gemini-3.1-flash-lite"

    # Google Maps (Routes API) para calcular la ruta y los tiempos de llegada de los viajes de los repartidores.
    GOOGLE_MAPS_API_KEY: str = ""
    # Dirección de la API de rutas; solo se cambia en los tests e2e, que usan un servidor falso.
    GOOGLE_MAPS_ROUTES_URL: str = "https://routes.googleapis.com/directions/v2:computeRoutes"
    # API que ubica las direcciones de los pedidos (también se reemplaza en los e2e).
    GOOGLE_MAPS_GEOCODE_URL: str = "https://maps.googleapis.com/maps/api/geocode/json"
    # Una dirección que, aun la más cercana al local, queda más lejos que esto se rechaza (0 = sin límite).
    DELIVERY_MAX_DISTANCE_KM: float = 50.0
    # Sesgo regional de las direcciones (código de país).
    GOOGLE_MAPS_REGION: str = "ar"
    # Minutos que el repartidor tarda en entregar a cada cliente: se suman a la llegada de las paradas siguientes.
    DELIVERY_STOP_TOLERANCE_MINUTES: int = 3
    # Sin mensajes durante este tiempo, un chat intervenido por una persona vuelve al bot (10 minutos).
    MANUAL_MODE_TIMEOUT_SECONDS: float = 600.0

    # Zona horaria del local: los horarios que pide el cliente ("para las 21:00") se interpretan en ella.
    RESTAURANT_TIMEZONE: str = "America/Argentina/Buenos_Aires"

    # Integración con MercadoPago
    MERCADOPAGO_ACCESS_TOKEN: str = ""
    MERCADOPAGO_PUBLIC_KEY: str = ""
    MERCADOPAGO_WEBHOOK_SECRET: str = ""
    # URL de la web de pedidos: MercadoPago devuelve ahí al cliente después de pagar.
    FRONTEND_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def canales_habilitados(self) -> frozenset[Channel]:
        return frozenset(Channel(nombre.strip().lower()) for nombre in self.BOT_CHANNELS.split(",") if nombre.strip())

    @model_validator(mode="after")
    def _credenciales_de_los_canales_habilitados(self) -> "Settings":
        habilitados = self.canales_habilitados
        if not habilitados:
            raise ValueError("BOT_CHANNELS debe incluir al menos un canal (telegram, whatsapp).")
        for canal in habilitados:
            self._exigir_credenciales(canal)
        if not re.match(r"^\d{4}$", self.ADMIN_PIN):
            raise ValueError("ADMIN_PIN debe ser un código numérico de 4 dígitos (ej. '1234').")
        return self

    def _exigir_credenciales(self, canal: Channel) -> None:
        faltan = [nombre for nombre in _CREDENCIALES_POR_CANAL[canal] if not getattr(self, nombre)]
        if faltan:
            raise ValueError(
                f"El canal '{canal}' está habilitado en BOT_CHANNELS y falta configurar: {', '.join(faltan)}."
            )

    @property
    def telegram_webhook_secret(self) -> str:
        """Secreto que Telegram envía en cada llamada al webhook para probar que viene de él.

        Siempre hay uno: si no se configura TELEGRAM_WEBHOOK_SECRET se deriva del token del bot, que es
        privado. Así el webhook nunca queda abierto a cualquiera que conozca la URL.
        """
        if self.TELEGRAM_WEBHOOK_SECRET:
            return self.TELEGRAM_WEBHOOK_SECRET
        return hashlib.sha256(f"telegram-webhook:{self.TELEGRAM_TOKEN}".encode()).hexdigest()


settings = Settings()  # pyright: ignore[reportCallIssue]  # los campos obligatorios vienen del entorno
