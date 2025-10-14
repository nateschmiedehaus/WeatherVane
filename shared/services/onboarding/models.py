"""Data models for onboarding progress snapshots."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Sequence


class OnboardingMode(str, Enum):
    """Supported onboarding data modes."""

    DEMO = "demo"
    LIVE = "live"


@dataclass(slots=True)
class ConnectorProgressRecord:
    """Represents connector onboarding progress for a tenant."""

    slug: str
    label: str
    status: str
    progress: int
    summary: str | None = None
    action: str | None = None
    updated_at: datetime | None = None


@dataclass(slots=True)
class AutomationAuditRecord:
    """Represents a recent automation audit event for onboarding proof."""

    id: str
    status: str
    headline: str
    detail: str | None = None
    actor: str | None = None
    occurred_at: datetime | None = None


@dataclass(slots=True)
class OnboardingSnapshot:
    """Aggregated onboarding payload for the API response."""

    tenant_id: str
    mode: OnboardingMode
    connectors: Sequence[ConnectorProgressRecord]
    audits: Sequence[AutomationAuditRecord]
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    fallback_reason: str | None = None

