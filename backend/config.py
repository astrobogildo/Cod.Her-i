from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Código: Herói"
    DATABASE_URL: str = "sqlite+aiosqlite:///./codigo_heroi.db"
    SECRET_KEY: str = "change-me-in-production-use-a-real-secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h — local game sessions are long

    class Config:
        env_file = ".env"


settings = Settings()
