"""Deterministic demo payload builders for onboarding progress."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from .models import AutomationAuditRecord, ConnectorProgressRecord

_DEMO_UPDATED_AT = datetime(2025, 10, 15, 3, 10, tzinfo=timezone.utc)
_DEMO_AUDIT_AT = datetime(2025, 10, 15, 3, 8, tzinfo=timezone.utc)


def build_demo_connectors(tenant_id: str) -> Iterable[ConnectorProgressRecord]:
    """Return deterministic connector progress records for demo mode."""

    base_summary = "Campaign structure synced and budget guardrails verified."
    return [
        ConnectorProgressRecord(
            slug="meta-primary",
            label="Meta Ads",
            status="ready",
            progress=100,
            summary=base_summary,
            action=None,
            updated_at=_DEMO_UPDATED_AT,
        ),
        ConnectorProgressRecord(
            slug="google-ads",
            label="Google Ads",
            status="needs_action",
            progress=60,
            summary="Conversion tags connected, awaiting billing verification.",
            action="verify_billing",
            updated_at=_DEMO_UPDATED_AT,
        ),
        ConnectorProgressRecord(
            slug="shopify",
            label="Shopify",
            status="in_progress",
            progress=40,
            summary="Catalog import queued; confirm product metafields mapping.",
            action="review_catalog_mapping",
            updated_at=_DEMO_UPDATED_AT,
        ),
    ]


def build_demo_audits(tenant_id: str) -> Iterable[AutomationAuditRecord]:
    """Return deterministic automation audit preview records for demo mode."""

    return [
        AutomationAuditRecord(
            id=f"{tenant_id}-audit-1",
            status="approved",
            headline="Autopilot rebalanced Meta Advantage+ budgets (+12%)",
            detail="Validated safety guardrails before applying pacing adjustments.",
            actor="Autopilot engine",
            occurred_at=_DEMO_AUDIT_AT,
        ),
        AutomationAuditRecord(
            id=f"{tenant_id}-audit-2",
            status="pending",
            headline="Google Ads expansion awaiting final approval",
            detail="Ready to launch 3 Smart Campaign variants once budget review completes.",
            actor="Automation reviewer",
            occurred_at=_DEMO_AUDIT_AT,
        ),
    ]

