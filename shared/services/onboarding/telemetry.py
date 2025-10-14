"""Telemetry helpers for onboarding events."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Mapping

from shared.observability import metrics

from .models import OnboardingMode


@dataclass(slots=True)
class OnboardingEvent:
    """Represents an onboarding analytics/telemetry event."""

    tenant_id: str
    name: str
    mode: OnboardingMode
    metadata: Mapping[str, object] = field(default_factory=dict)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


def record_onboarding_event(event: OnboardingEvent) -> None:
    """Emit onboarding telemetry for analytics and audit trails."""

    metrics.emit(
        "onboarding.event",
        {
            "tenant_id": event.tenant_id,
            "name": event.name,
            "metadata": dict(event.metadata),
            "occurred_at": event.occurred_at.isoformat(),
        },
        tags={"mode": event.mode.value},
    )

