"""Pydantic schemas for onboarding progress routes."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping

from pydantic import BaseModel, Field

from shared.services.onboarding import (
    AutomationAuditRecord,
    ConnectorProgressRecord,
    OnboardingEvent,
    OnboardingMode,
    OnboardingSnapshot,
)


class ConnectorProgressModel(BaseModel):
    """Connector progress response model."""

    slug: str = Field(..., description="Connector slug identifier.")
    label: str = Field(..., description="Human readable connector name.")
    status: str = Field(..., description="Connector onboarding status indicator.")
    progress: int = Field(..., ge=0, le=100, description="Percent completion for connector.")
    summary: str | None = Field(None, description="Summary of connector readiness.")
    action: str | None = Field(
        None,
        description="Optional action code to unblock progress.",
    )
    updated_at: datetime | None = Field(
        None,
        description="Timestamp of the latest connector progress update.",
    )

    @classmethod
    def from_record(cls, record: ConnectorProgressRecord) -> "ConnectorProgressModel":
        return cls(
            slug=record.slug,
            label=record.label,
            status=record.status,
            progress=record.progress,
            summary=record.summary,
            action=record.action,
            updated_at=record.updated_at,
        )


class AutomationAuditModel(BaseModel):
    """Automation audit preview response model."""

    id: str = Field(..., description="Unique audit record identifier.")
    status: str = Field(..., description="Automation audit status.")
    headline: str = Field(..., description="Summary headline for the audit.")
    detail: str | None = Field(None, description="Detailed description of the audit event.")
    actor: str | None = Field(None, description="Actor associated with the audit event.")
    occurred_at: datetime | None = Field(
        None,
        description="Timestamp of when the audit event occurred.",
    )

    @classmethod
    def from_record(cls, record: AutomationAuditRecord) -> "AutomationAuditModel":
        return cls(
            id=record.id,
            status=record.status,
            headline=record.headline,
            detail=record.detail,
            actor=record.actor,
            occurred_at=record.occurred_at,
        )


class OnboardingProgressResponse(BaseModel):
    """Response model for onboarding progress snapshots."""

    tenant_id: str
    mode: OnboardingMode
    generated_at: datetime
    fallback_reason: str | None = Field(
        None,
        description="Reason for falling back to demo payloads, if applicable.",
    )
    connectors: list[ConnectorProgressModel]
    audits: list[AutomationAuditModel]

    @classmethod
    def from_snapshot(cls, snapshot: OnboardingSnapshot) -> "OnboardingProgressResponse":
        return cls(
            tenant_id=snapshot.tenant_id,
            mode=snapshot.mode,
            generated_at=snapshot.generated_at,
            fallback_reason=snapshot.fallback_reason,
            connectors=[
                ConnectorProgressModel.from_record(record) for record in snapshot.connectors
            ],
            audits=[AutomationAuditModel.from_record(record) for record in snapshot.audits],
        )


class OnboardingEventRequest(BaseModel):
    """Request payload for recording onboarding telemetry events."""

    tenant_id: str
    name: str = Field(..., description="Event name representing the onboarding interaction.")
    mode: OnboardingMode = OnboardingMode.DEMO
    metadata: Mapping[str, object] | None = Field(
        default=None,
        description="Optional metadata captured alongside the event.",
    )
    occurred_at: datetime | None = Field(
        default=None,
        description="ISO timestamp when the event occurred; defaults to server receive time.",
    )

    def to_event(self) -> OnboardingEvent:
        return OnboardingEvent(
            tenant_id=self.tenant_id,
            name=self.name,
            mode=self.mode,
            metadata=self.metadata or {},
            occurred_at=self.occurred_at or datetime.now(timezone.utc),
        )


class OnboardingEventResponse(BaseModel):
    """Acknowledgement model for onboarding telemetry events."""

    status: str = Field("recorded", description="Telemetry acknowledgement status.")
