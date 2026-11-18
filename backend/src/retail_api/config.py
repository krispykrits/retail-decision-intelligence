from enum import StrEnum
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    DEVELOPMENT = "development"


class MailSettings(BaseModel):
    host: str
    port: int = Field(default=587, ge=1, le=65535)
    username: str
    password: SecretStr
    sender: EmailStr


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="RDI_", env_nested_delimiter="__", env_file=".env", extra="ignore"
    )

    environment: Environment = Environment.LOCAL
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    database_url: SecretStr = SecretStr("sqlite+pysqlite:///:memory:")
    sql_server: str | None = None
    sql_database: str | None = None
    static_directory: Path | None = None
    public_url: str = "http://localhost:5173"
    auth_secret: SecretStr | None = None
    mail: MailSettings | None = None
    import_max_bytes: int = Field(default=192 * 1024 * 1024, ge=25 * 1024 * 1024)

    @model_validator(mode="after")
    def validate_configuration(self) -> "Settings":
        public_url = urlsplit(self.public_url)
        if (
            public_url.scheme not in {"http", "https"}
            or not public_url.hostname
            or public_url.username
            or public_url.password
            or public_url.query
            or public_url.fragment
            or public_url.path not in {"", "/"}
        ):
            raise ValueError("Public URL must be an HTTP(S) origin without a path or credentials")
        if bool(self.sql_server) != bool(self.sql_database):
            raise ValueError("SQL server and database must be configured together")
        if "*" in self.cors_origins:
            raise ValueError("CORS origins must be explicit")
        if self.environment is Environment.DEVELOPMENT and self.cors_origins:
            raise ValueError("Development uses one origin; leave CORS origins empty")
        if self.auth_secret and len(self.auth_secret.get_secret_value()) < 32:
            raise ValueError("The account signing secret must have at least 32 characters")
        if self.environment is Environment.DEVELOPMENT and not self.public_url.startswith(
            "https://"
        ):
            if self.auth_secret:
                raise ValueError("Development account links require an HTTPS public URL")
        return self
