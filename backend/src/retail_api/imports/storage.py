"""Private Azure Blob and Queue clients for durable imports."""

import os
from datetime import UTC, datetime, timedelta
from uuid import UUID

from azure.identity import AzureCliCredential, ManagedIdentityCredential
from azure.storage.blob import BlobClient, BlobSasPermissions, BlobServiceClient, generate_blob_sas
from azure.storage.queue import QueueClient

from retail_api.config import Settings

STORAGE_NAME = "csv-imports"
UPLOAD_LIFETIME = timedelta(minutes=30)


class ImportStorage:
    def __init__(self, settings: Settings) -> None:
        account = settings.import_storage_account
        if not account:
            raise ValueError("Import storage is not configured")
        self.account = account
        client_id = os.environ.get("AZURE_CLIENT_ID")
        self.credential = (
            ManagedIdentityCredential(client_id=client_id)
            if client_id
            else AzureCliCredential(process_timeout=5)
        )
        self.blobs = BlobServiceClient(
            f"https://{account}.blob.core.windows.net",
            credential=self.credential,
        )
        self.queue = QueueClient(
            f"https://{account}.queue.core.windows.net",
            queue_name=STORAGE_NAME,
            credential=self.credential,
        )

    def blob(self, import_id: UUID) -> BlobClient:
        return self.blobs.get_blob_client(STORAGE_NAME, f"{import_id}.csv")

    def upload_url(self, import_id: UUID) -> str:
        blob = self.blob(import_id)
        now = datetime.now(UTC)
        expiry = now + UPLOAD_LIFETIME
        key = self.blobs.get_user_delegation_key(now - timedelta(minutes=2), expiry)
        token = generate_blob_sas(
            account_name=self.account,
            container_name=blob.container_name,
            blob_name=blob.blob_name,
            user_delegation_key=key,
            permission=BlobSasPermissions(create=True),
            expiry=expiry,
            protocol="https",
        )
        return f"{blob.url}?{token}"

    def close(self) -> None:
        self.queue.close()
        self.blobs.close()
        self.credential.close()
