"""Onboarding progress service scaffolding."""

from .models import (
    AutomationAuditRecord,
    ConnectorProgressRecord,
    OnboardingMode,
    OnboardingSnapshot,
)
from .progress import get_onboarding_snapshot
from .telemetry import OnboardingEvent, record_onboarding_event

__all__ = [
    "AutomationAuditRecord",
    "ConnectorProgressRecord",
    "OnboardingMode",
    "OnboardingSnapshot",
    "OnboardingEvent",
    "get_onboarding_snapshot",
    "record_onboarding_event",
]
