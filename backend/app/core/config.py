from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://medsoft:medsoft@localhost:5432/medsoft"
    API_PREFIX: str = "/api/v1"

    SECRET_KEY: str = "medsoft-phase4-secret-change-in-production-xyz789abc"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours

    class Config:
        env_file = ".env"


settings = Settings()
