from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from retail_api.accounts.models import Role


class RegisterAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str = Field(min_length=1, max_length=100, pattern="\\S")
    email: EmailStr
    password: str = Field(
        min_length=15, max_length=128, json_schema_extra={"format": "password", "writeOnly": True}
    )


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    display_name: str
    email: EmailStr
    roles: list[Role]


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(
        min_length=1, max_length=128, json_schema_extra={"format": "password", "writeOnly": True}
    )


class EmailRequest(BaseModel):
    email: EmailStr


class LinkToken(BaseModel):
    token: str = Field(min_length=1, max_length=4096, json_schema_extra={"writeOnly": True})


class ResetPassword(LinkToken):
    password: str = Field(
        min_length=15, max_length=128, json_schema_extra={"format": "password", "writeOnly": True}
    )


class CsrfToken(BaseModel):
    token: str


class ErrorResponse(BaseModel):
    detail: str
