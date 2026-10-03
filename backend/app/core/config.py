from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "TIP"
    API_V1_STR: str = "/api/v1"

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "root"
    POSTGRES_DB: str = "tip"
    DATABASE_URL: str = ""

    TELEGRAM_TOKEN: str
    GOOGLE_API_KEY: str
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

    # Zona horaria del local: los horarios que pide el cliente ("para las 21:00") se interpretan en ella.
    RESTAURANT_TIMEZONE: str = "America/Argentina/Buenos_Aires"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()