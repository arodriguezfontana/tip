import hashlib

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.channels import Channel


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
    BOT_BATCH_WINDOW_SECONDS: float = 2.0
    BOT_BATCH_MAX_WAIT_SECONDS: float = 6.0

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
        requeridas = {
            Channel.TELEGRAM: ("TELEGRAM_TOKEN",),
            Channel.WHATSAPP: (
                "WHATSAPP_ACCESS_TOKEN",
                "WHATSAPP_PHONE_NUMBER_ID",
                "WHATSAPP_VERIFY_TOKEN",
                "WHATSAPP_APP_SECRET",
            ),
        }
        habilitados = self.canales_habilitados
        if not habilitados:
            raise ValueError("BOT_CHANNELS debe incluir al menos un canal (telegram, whatsapp).")
        for canal in habilitados:
            faltan = [nombre for nombre in requeridas[canal] if not getattr(self, nombre)]
            if faltan:
                raise ValueError(f"El canal '{canal}' está habilitado en BOT_CHANNELS y falta configurar: {', '.join(faltan)}.")
        return self

    @property
    def telegram_webhook_secret(self) -> str:
        """Secreto que Telegram envía en cada llamada al webhook para probar que viene de él.

        Siempre hay uno: si no se configura TELEGRAM_WEBHOOK_SECRET se deriva del token del bot, que es
        privado. Así el webhook nunca queda abierto a cualquiera que conozca la URL.
        """
        if self.TELEGRAM_WEBHOOK_SECRET:
            return self.TELEGRAM_WEBHOOK_SECRET
        return hashlib.sha256(f"telegram-webhook:{self.TELEGRAM_TOKEN}".encode()).hexdigest()


settings = Settings()
