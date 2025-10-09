"""Pluggable connector interfaces used by the universal connector platform."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, AsyncIterator, Mapping, MutableMapping, Optional, Protocol, Sequence


class AuthMethod(str, Enum):
    API_KEY = "api_key"
    OAUTH2 = "oauth2"
    SERVICE_ACCOUNT = "service_account"
    SIGNED_WEBHOOK = "signed_webhook"


class Capability(str, Enum):
    ADS = "ads"
    PROMOS = "promos"
    FLOWS = "flows"
    EVENTS = "events"
    CUSTOM = "custom"


@dataclass(frozen=True)
class SecretField:
    key: str
    label: str
    required: bool = True


@dataclass(frozen=True)
class StreamSchema:
    name: str
    object_type: str
    capabilities: Sequence[Capability]
    primary_keys: Sequence[str]
    incremental_field: Optional[str] = None
    description: Optional[str] = None


@dataclass(frozen=True)
class SyncConfig:
    start_at: Optional[str] = None
    end_at: Optional[str] = None
    slice: Optional[Mapping[str, Any]] = None
    tenant_id: Optional[str] = None


@dataclass(frozen=True)
class SyncState:
    cursor: MutableMapping[str, Any]


@dataclass(frozen=True)
class ConnectorManifest:
    slug: str
    display_name: str
    logo_path: str
    description: str
    auth_method: AuthMethod
    secret_fields: Sequence[SecretField]
    categories: Sequence[str]
    capabilities: Sequence[Capability]


@dataclass(frozen=True)
class RecordMessage:
    stream: str
    data: Mapping[str, Any]


@dataclass(frozen=True)
class StateMessage:
    cursor: Mapping[str, Any]


ConnectorMessage = RecordMessage | StateMessage


class ConnectorPlugin(Protocol):
    """Protocol implemented by each connector provider."""

    manifest: ConnectorManifest

    async def validate_credentials(self, secrets: Mapping[str, str]) -> None:
        ...

    async def discover(self, secrets: Mapping[str, str]) -> Sequence[StreamSchema]:
        ...

    async def sync(
        self,
        stream: StreamSchema,
        secrets: Mapping[str, str],
        state: SyncState,
        config: SyncConfig,
    ) -> AsyncIterator[ConnectorMessage]:
        ...

    async def close(self) -> None:
        ...
