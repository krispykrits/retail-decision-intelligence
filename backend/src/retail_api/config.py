from pathlib import Path
from typing import Literal

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RDI_", env_file=".env", extra="ignore")

    environment: Literal["local", "development"] = "local"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_url: SecretStr = SecretStr("sqlite+pysqlite:///:memory:")
    sql_server: str | None = None
    sql_database: str | None = None
    static_directory: Path | None = None

    @model_validator(mode="after")
    def validate_configuration(self) -> "Settings":
        if bool(self.sql_server) != bool(self.sql_database):
            raise ValueError("SQL server and database must be configured together")
        if "*" in self.cors_origins:
            raise ValueError("CORS origins must be explicit")
        if self.environment == "development" and self.cors_origins:
            raise ValueError("Development uses one origin; leave CORS origins empty")
        return self
