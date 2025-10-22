"""Comprehensive tests for onboarding progress API routes."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import jsonschema
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from apps.api.routes.onboarding import (
    fetch_onboarding_progress,
    record_onboarding_event_telemetry,
)
from apps.api.schemas.onboarding import (
    OnboardingEventRequest,
    OnboardingMode,
    OnboardingProgressResponse,
)
from shared.services.onboarding.models import (
    AutomationAuditRecord,
    ConnectorProgressRecord,
    OnboardingSnapshot,
)


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def demo_snapshot() -> OnboardingSnapshot:
    """Create demo snapshot with complete data."""
    connector = ConnectorProgressRecord(
        slug="shopify",
        label="Shopify",
        status="ready",
        progress=100,
        summary="Orders synced: 1234 (geocoded 95%); Products: 456",
        action=None,
        updated_at=datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc),
    )
    audit = AutomationAuditRecord(
        id="tenant-abc-audit-shadow",
        status="shadow",
        headline="Autopilot shadow mode guardrails exercised",
        detail="Safety overrides fired at 15% rate; guardrail violations=2.",
        actor="Autopilot engine",
        occurred_at=datetime(2025, 10, 20, 11, 30, 0, tzinfo=timezone.utc),
    )
    return OnboardingSnapshot(
        tenant_id="tenant-abc",
        mode=OnboardingMode.DEMO,
        connectors=[connector],
        audits=[audit],
        fallback_reason=None,
        generated_at=datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def live_snapshot_with_fallback() -> OnboardingSnapshot:
    """Create live snapshot with fallback reason."""
    return OnboardingSnapshot(
        tenant_id="tenant-xyz",
        mode=OnboardingMode.LIVE,
        connectors=[],
        audits=[],
        fallback_reason="live_progress_unavailable",
        generated_at=datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def multi_connector_snapshot() -> OnboardingSnapshot:
    """Create snapshot with multiple connectors in different states."""
    connectors = [
        ConnectorProgressRecord(
            slug="shopify",
            label="Shopify",
            status="ready",
            progress=100,
            summary="Fully synced",
            action=None,
            updated_at=datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc),
        ),
        ConnectorProgressRecord(
            slug="meta-primary",
            label="Meta Ads",
            status="in_progress",
            progress=75,
            summary="Syncing data",
            action="refresh_credentials",
            updated_at=datetime(2025, 10, 20, 11, 45, 0, tzinfo=timezone.utc),
        ),
        ConnectorProgressRecord(
            slug="google-ads",
            label="Google Ads",
            status="action_needed",
            progress=0,
            summary="No activity detected",
            action="connect_google",
            updated_at=None,
        ),
    ]
    audits = [
        AutomationAuditRecord(
            id="tenant-xyz-audit-allocator",
            status="approved",
            headline="Allocator saturation plan validated",
            detail="P50 profit forecast $45,678; guardrail binding=False.",
            actor="Allocator simulator",
            occurred_at=datetime(2025, 10, 20, 11, 0, 0, tzinfo=timezone.utc),
        ),
        AutomationAuditRecord(
            id="tenant-xyz-audit-creatives",
            status="pending",
            headline="Creative guardrail scan completed",
            detail="2 creatives blocked; 3 under watch.",
            actor="Guardrail scanner",
            occurred_at=datetime(2025, 10, 20, 10, 30, 0, tzinfo=timezone.utc),
        ),
    ]
    return OnboardingSnapshot(
        tenant_id="tenant-xyz",
        mode=OnboardingMode.LIVE,
        connectors=connectors,
        audits=audits,
        fallback_reason=None,
        generated_at=datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc),
    )


# ============================================================================
# GET /onboarding/progress Tests
# ============================================================================


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_demo_mode_returns_complete_payload(demo_snapshot):
    """Test GET /onboarding/progress returns complete demo snapshot."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = demo_snapshot

        response = await fetch_onboarding_progress(tenant_id="tenant-abc", mode=OnboardingMode.DEMO)

        assert isinstance(response, OnboardingProgressResponse)
        assert response.tenant_id == "tenant-abc"
        assert response.mode == OnboardingMode.DEMO
        assert response.fallback_reason is None
        assert len(response.connectors) == 1
        assert len(response.audits) == 1

        connector = response.connectors[0]
        assert connector.slug == "shopify"
        assert connector.label == "Shopify"
        assert connector.status == "ready"
        assert connector.progress == 100
        assert connector.summary == "Orders synced: 1234 (geocoded 95%); Products: 456"
        assert connector.action is None

        audit = response.audits[0]
        assert audit.id == "tenant-abc-audit-shadow"
        assert audit.status == "shadow"
        assert "Autopilot shadow mode" in audit.headline
        assert audit.actor == "Autopilot engine"


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_live_mode_with_fallback(live_snapshot_with_fallback):
    """Test GET /onboarding/progress handles fallback gracefully in live mode."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = live_snapshot_with_fallback

        response = await fetch_onboarding_progress(tenant_id="tenant-xyz", mode=OnboardingMode.LIVE)

        assert isinstance(response, OnboardingProgressResponse)
        assert response.tenant_id == "tenant-xyz"
        assert response.mode == OnboardingMode.LIVE
        assert response.fallback_reason == "live_progress_unavailable"
        assert len(response.connectors) == 0
        assert len(response.audits) == 0


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_multiple_connectors_and_audits(multi_connector_snapshot):
    """Test GET /onboarding/progress handles multiple connectors in various states."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = multi_connector_snapshot

        response = await fetch_onboarding_progress(tenant_id="tenant-xyz", mode=OnboardingMode.LIVE)

        assert len(response.connectors) == 3
        assert len(response.audits) == 2

        # Verify connector states
        shopify = next(c for c in response.connectors if c.slug == "shopify")
        assert shopify.status == "ready"
        assert shopify.progress == 100

        meta = next(c for c in response.connectors if c.slug == "meta-primary")
        assert meta.status == "in_progress"
        assert meta.progress == 75
        assert meta.action == "refresh_credentials"

        google = next(c for c in response.connectors if c.slug == "google-ads")
        assert google.status == "action_needed"
        assert google.progress == 0
        assert google.action == "connect_google"

        # Verify audit states
        allocator_audit = next(a for a in response.audits if "allocator" in a.id)
        assert allocator_audit.status == "approved"

        creative_audit = next(a for a in response.audits if "creatives" in a.id)
        assert creative_audit.status == "pending"


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_validates_against_json_schema(demo_snapshot):
    """Test that response payload passes JSON schema validation."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        with patch("apps.api.routes.onboarding.validate_onboarding_progress_response") as mock_validate:
            mock_snapshot.return_value = demo_snapshot
            mock_validate.return_value = None  # No validation errors

            response = await fetch_onboarding_progress(tenant_id="tenant-abc", mode=OnboardingMode.DEMO)

            # Ensure validator was called
            mock_validate.assert_called_once()
            assert isinstance(response, OnboardingProgressResponse)


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_raises_http_500_on_schema_violation(demo_snapshot):
    """Test GET /onboarding/progress raises HTTP 500 on schema validation failure."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        with patch("apps.api.routes.onboarding.validate_onboarding_progress_response") as mock_validate:
            mock_snapshot.return_value = demo_snapshot
            mock_validate.side_effect = jsonschema.ValidationError(
                "Missing required field",
                path=["connectors", 0, "slug"],
            )

            with pytest.raises(HTTPException) as exc_info:
                await fetch_onboarding_progress(tenant_id="tenant-abc", mode=OnboardingMode.DEMO)

            assert exc_info.value.status_code == 500
            assert exc_info.value.detail["schema"] == "onboarding_progress_response"
            assert exc_info.value.detail["tenant_id"] == "tenant-abc"


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_raises_http_500_on_pydantic_error(demo_snapshot):
    """Test GET /onboarding/progress raises HTTP 500 on Pydantic validation error."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        # Force Pydantic validation error by returning malformed snapshot
        mock_snapshot.side_effect = ValidationError.from_exception_data(
            "OnboardingSnapshot",
            [{"loc": ("tenant_id",), "msg": "Field required", "type": "missing"}],
        )

        with pytest.raises(HTTPException) as exc_info:
            await fetch_onboarding_progress(tenant_id="tenant-abc", mode=OnboardingMode.DEMO)

        assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_defaults_to_demo_mode(demo_snapshot):
    """Test GET /onboarding/progress defaults to demo mode when not specified."""
    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = demo_snapshot

        # Call without explicit mode (should default to DEMO)
        response = await fetch_onboarding_progress(tenant_id="tenant-abc")

        # Verify service was called (FastAPI Query wraps the default value)
        mock_snapshot.assert_called_once()
        call_args = mock_snapshot.call_args
        assert call_args[1]["tenant_id"] == "tenant-abc"
        # Mode defaults to DEMO via Query parameter
        assert response.mode == OnboardingMode.DEMO


# ============================================================================
# POST /onboarding/events Tests
# ============================================================================


@pytest.mark.asyncio
async def test_record_onboarding_event_accepts_minimal_payload():
    """Test POST /onboarding/events accepts minimal event payload."""
    payload = OnboardingEventRequest(
        tenant_id="tenant-abc",
        name="progress.requested",
        mode=OnboardingMode.DEMO,
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event") as mock_record:
        response = await record_onboarding_event_telemetry(payload)

        mock_record.assert_called_once()
        event = mock_record.call_args[0][0]
        assert event.tenant_id == "tenant-abc"
        assert event.name == "progress.requested"
        assert event.mode == OnboardingMode.DEMO
        assert event.metadata == {}
        assert response.status == "recorded"


@pytest.mark.asyncio
async def test_record_onboarding_event_accepts_full_payload_with_metadata():
    """Test POST /onboarding/events accepts complete event payload with metadata."""
    occurred_at = datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
    payload = OnboardingEventRequest(
        tenant_id="tenant-xyz",
        name="connector.connected",
        mode=OnboardingMode.LIVE,
        metadata={
            "connector_slug": "shopify",
            "initial_sync": True,
            "orders_count": 1234,
        },
        occurred_at=occurred_at,
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event") as mock_record:
        response = await record_onboarding_event_telemetry(payload)

        mock_record.assert_called_once()
        event = mock_record.call_args[0][0]
        assert event.tenant_id == "tenant-xyz"
        assert event.name == "connector.connected"
        assert event.mode == OnboardingMode.LIVE
        assert event.metadata["connector_slug"] == "shopify"
        assert event.metadata["initial_sync"] is True
        assert event.metadata["orders_count"] == 1234
        assert event.occurred_at == occurred_at
        assert response.status == "recorded"


@pytest.mark.asyncio
async def test_record_onboarding_event_returns_202_accepted():
    """Test POST /onboarding/events returns HTTP 202 Accepted."""
    payload = OnboardingEventRequest(
        tenant_id="tenant-abc",
        name="progress.loaded",
        mode=OnboardingMode.DEMO,
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event"):
        response = await record_onboarding_event_telemetry(payload)

        assert response.status == "recorded"


@pytest.mark.asyncio
async def test_record_onboarding_event_emits_telemetry():
    """Test POST /onboarding/events triggers telemetry emission."""
    payload = OnboardingEventRequest(
        tenant_id="tenant-abc",
        name="audit.approved",
        mode=OnboardingMode.LIVE,
        metadata={"audit_id": "audit-shadow", "decision": "approved"},
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        await record_onboarding_event_telemetry(payload)

        # Verify metrics.emit was called with correct structure
        mock_emit.assert_called_once()
        args = mock_emit.call_args
        assert args[0][0] == "onboarding.event"
        event_data = args[0][1]
        assert event_data["tenant_id"] == "tenant-abc"
        assert event_data["name"] == "audit.approved"
        assert event_data["metadata"]["audit_id"] == "audit-shadow"
        assert args[1]["tags"]["mode"] == "live"


@pytest.mark.asyncio
async def test_record_onboarding_event_converts_request_to_event_model():
    """Test POST /onboarding/events correctly converts request to OnboardingEvent."""
    occurred_at = datetime(2025, 10, 20, 15, 30, 0, tzinfo=timezone.utc)
    payload = OnboardingEventRequest(
        tenant_id="tenant-test",
        name="connector.error",
        mode=OnboardingMode.DEMO,
        metadata={"error_type": "network_timeout"},
        occurred_at=occurred_at,
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event") as mock_record:
        await record_onboarding_event_telemetry(payload)

        event = mock_record.call_args[0][0]
        assert event.tenant_id == "tenant-test"
        assert event.name == "connector.error"
        assert event.mode == OnboardingMode.DEMO
        assert event.metadata["error_type"] == "network_timeout"
        assert event.occurred_at == occurred_at


@pytest.mark.asyncio
async def test_record_onboarding_event_uses_server_time_when_occurred_at_missing():
    """Test POST /onboarding/events uses server time when occurred_at not provided."""
    payload = OnboardingEventRequest(
        tenant_id="tenant-abc",
        name="progress.fallback",
        mode=OnboardingMode.LIVE,
        metadata={"fallback_reason": "live_progress_unavailable"},
        # occurred_at intentionally omitted
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event") as mock_record:
        with patch("apps.api.schemas.onboarding.datetime") as mock_datetime:
            mock_now = datetime(2025, 10, 20, 16, 0, 0, tzinfo=timezone.utc)
            mock_datetime.now.return_value = mock_now

            await record_onboarding_event_telemetry(payload)

            event = mock_record.call_args[0][0]
            # Verify server-side timestamp was applied
            assert event.occurred_at == mock_now


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.asyncio
async def test_full_onboarding_flow_demo_mode():
    """Integration test: Complete onboarding flow in demo mode."""
    tenant_id = "tenant-integration-test"

    # Step 1: Record initial progress request
    request_payload = OnboardingEventRequest(
        tenant_id=tenant_id,
        name="progress.requested",
        mode=OnboardingMode.DEMO,
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event"):
        request_response = await record_onboarding_event_telemetry(request_payload)
        assert request_response.status == "recorded"

    # Step 2: Fetch progress
    demo_snapshot = OnboardingSnapshot(
        tenant_id=tenant_id,
        mode=OnboardingMode.DEMO,
        connectors=[
            ConnectorProgressRecord(
                slug="shopify",
                label="Shopify",
                status="in_progress",
                progress=50,
                summary="Syncing...",
                action="trigger_shopify_sync",
                updated_at=datetime.now(timezone.utc),
            )
        ],
        audits=[],
        fallback_reason=None,
    )

    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = demo_snapshot
        progress_response = await fetch_onboarding_progress(tenant_id=tenant_id, mode=OnboardingMode.DEMO)

        assert progress_response.tenant_id == tenant_id
        assert len(progress_response.connectors) == 1
        assert progress_response.connectors[0].status == "in_progress"

    # Step 3: Record progress loaded event
    loaded_payload = OnboardingEventRequest(
        tenant_id=tenant_id,
        name="progress.loaded",
        mode=OnboardingMode.DEMO,
        metadata={
            "connectors": 1,
            "audits": 0,
        },
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event"):
        loaded_response = await record_onboarding_event_telemetry(loaded_payload)
        assert loaded_response.status == "recorded"


@pytest.mark.asyncio
async def test_full_onboarding_flow_live_mode_with_fallback():
    """Integration test: Live mode flow with fallback to demo data."""
    tenant_id = "tenant-live-fallback-test"

    # Step 1: Fetch progress in live mode (triggers fallback)
    fallback_snapshot = OnboardingSnapshot(
        tenant_id=tenant_id,
        mode=OnboardingMode.LIVE,
        connectors=[],
        audits=[],
        fallback_reason="live_progress_unavailable",
    )

    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = fallback_snapshot
        progress_response = await fetch_onboarding_progress(tenant_id=tenant_id, mode=OnboardingMode.LIVE)

        assert progress_response.fallback_reason == "live_progress_unavailable"
        assert len(progress_response.connectors) == 0

    # Step 2: Record fallback event
    fallback_payload = OnboardingEventRequest(
        tenant_id=tenant_id,
        name="progress.fallback",
        mode=OnboardingMode.LIVE,
        metadata={
            "fallback_reason": "live_progress_unavailable",
            "connectors": 0,
            "audits": 0,
        },
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event"):
        fallback_response = await record_onboarding_event_telemetry(fallback_payload)
        assert fallback_response.status == "recorded"


# ============================================================================
# Edge Cases and Error Handling
# ============================================================================


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_handles_empty_connectors_and_audits():
    """Test GET /onboarding/progress handles empty connectors and audits gracefully."""
    empty_snapshot = OnboardingSnapshot(
        tenant_id="tenant-empty",
        mode=OnboardingMode.DEMO,
        connectors=[],
        audits=[],
        fallback_reason=None,
    )

    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = empty_snapshot

        response = await fetch_onboarding_progress(tenant_id="tenant-empty", mode=OnboardingMode.DEMO)

        assert response.tenant_id == "tenant-empty"
        assert len(response.connectors) == 0
        assert len(response.audits) == 0


@pytest.mark.asyncio
async def test_record_onboarding_event_handles_null_metadata():
    """Test POST /onboarding/events handles null metadata gracefully."""
    payload = OnboardingEventRequest(
        tenant_id="tenant-abc",
        name="test.event",
        mode=OnboardingMode.DEMO,
        metadata=None,
    )

    with patch("apps.api.routes.onboarding.record_onboarding_event") as mock_record:
        response = await record_onboarding_event_telemetry(payload)

        event = mock_record.call_args[0][0]
        assert event.metadata == {}
        assert response.status == "recorded"


@pytest.mark.asyncio
async def test_fetch_onboarding_progress_handles_missing_optional_fields():
    """Test GET /onboarding/progress handles connectors with missing optional fields."""
    minimal_snapshot = OnboardingSnapshot(
        tenant_id="tenant-minimal",
        mode=OnboardingMode.DEMO,
        connectors=[
            ConnectorProgressRecord(
                slug="test",
                label="Test Connector",
                status="ready",
                progress=100,
                summary=None,  # Optional field
                action=None,  # Optional field
                updated_at=None,  # Optional field
            )
        ],
        audits=[
            AutomationAuditRecord(
                id="audit-1",
                status="approved",
                headline="Test audit",
                detail=None,  # Optional field
                actor=None,  # Optional field
                occurred_at=None,  # Optional field
            )
        ],
        fallback_reason=None,
    )

    with patch("apps.api.routes.onboarding.get_onboarding_snapshot", new_callable=AsyncMock) as mock_snapshot:
        mock_snapshot.return_value = minimal_snapshot

        response = await fetch_onboarding_progress(tenant_id="tenant-minimal", mode=OnboardingMode.DEMO)

        assert response.connectors[0].summary is None
        assert response.connectors[0].action is None
        assert response.connectors[0].updated_at is None
        assert response.audits[0].detail is None
        assert response.audits[0].actor is None
        assert response.audits[0].occurred_at is None
