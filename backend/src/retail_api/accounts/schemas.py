from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from retail_api.accounts.models import Role


class RegisterAccount(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"\S",
        description="Name displayed in the application; does not grant permissions.",
        examples=["Retail analyst"],
    )
    email: EmailStr = Field(
        description="Email address to verify before sign-in.", examples=["analyst@example.com"]
    )
    password: str = Field(
        min_length=15,
        max_length=128,
        description="Password or passphrase; 15–128 characters.",
        json_schema_extra={"format": "password", "writeOnly": True},
    )


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Stable application account identifier.")
    display_name: str = Field(description="Account display name.")
    email: EmailStr = Field(description="Verified account email address.")
    roles: list[Role] = Field(
        description="Current SQL-managed permissions: Analyst or Administrator."
    )


class Credentials(BaseModel):
    email: EmailStr = Field(
        description="Registered, verified email address.", examples=["analyst@example.com"]
    )
    password: str = Field(
        min_length=1,
        max_length=128,
        description="Account password.",
        json_schema_extra={"format": "password", "writeOnly": True},
    )


class EmailRequest(BaseModel):
    email: EmailStr = Field(
        description="Account email; responses do not disclose whether it exists.",
        examples=["analyst@example.com"],
    )


class LinkToken(BaseModel):
    token: str = Field(
        min_length=1,
        max_length=4096,
        description=(
            "Token from the matching email link's #token fragment; expires after 30 minutes."
        ),
        json_schema_extra={"writeOnly": True},
    )


class ResetPassword(LinkToken):
    password: str = Field(
        min_length=15,
        max_length=128,
        description="New password or passphrase; 15–128 characters.",
        json_schema_extra={"format": "password", "writeOnly": True},
    )


class RoleChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Role = Field(description="Role to assign to another account; self-changes are forbidden.")


class AccountConfiguration(BaseModel):
    configured: bool = Field(description="Account signing configuration is present.")
    email_delivery: bool = Field(
        description="SMTP settings are present; this is not a delivery health check."
    )


class CsrfToken(BaseModel):
    token: str = Field(
        description=(
            "Send as X-CSRF-Token with the matching browser cookie on writes; valid for one hour."
        )
    )


class ErrorResponse(BaseModel):
    detail: str = Field(
        description="Safe error message; excludes credentials and provider/SQL details."
    )
