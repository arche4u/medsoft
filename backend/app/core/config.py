from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://medsoft:medsoft@localhost:5432/medsoft"
    API_PREFIX: str = "/api/v1"

    class Config:
        env_file = ".env"


settings = Settings()
