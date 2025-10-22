"""Tests for onboarding telemetry service."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from shared.services.onboarding.models import OnboardingMode
from shared.services.onboarding.telemetry import OnboardingEvent, record_onboarding_event


# ============================================================================
# OnboardingEvent Tests
# ============================================================================


def test_onboarding_event_dataclass_with_minimal_fields():
    """Test OnboardingEvent creation with minimal required fields."""
    event = OnboardingEvent(
        tenant_id="tenant-abc",
        name="progress.requested",
        mode=OnboardingMode.DEMO,
    )

    assert event.tenant_id == "tenant-abc"
    assert event.name == "progress.requested"
    assert event.mode == OnboardingMode.DEMO
    assert event.metadata == {}
    assert isinstance(event.occurred_at, datetime)


def test_onboarding_event_dataclass_with_all_fields():
    """Test OnboardingEvent creation with all fields populated."""
    occurred_at = datetime(2025, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
    metadata = {
        "connector_slug": "shopify",
        "orders_synced": 1234,
        "initial_sync": True,
    }

    event = OnboardingEvent(
        tenant_id="tenant-xyz",
        name="connector.connected",
        mode=OnboardingMode.LIVE,
        metadata=metadata,
        occurred_at=occurred_at,
    )

    assert event.tenant_id == "tenant-xyz"
    assert event.name == "connector.connected"
    assert event.mode == OnboardingMode.LIVE
    assert event.metadata == metadata
    assert event.occurred_at == occurred_at


def test_onboarding_event_defaults_occurred_at_to_now():
    """Test OnboardingEvent defaults occurred_at to current UTC time."""
    before = datetime.now(timezone.utc)
    event = OnboardingEvent(
        tenant_id="tenant-test",
        name="test.event",
        mode=OnboardingMode.DEMO,
    )
    after = datetime.now(timezone.utc)

    assert before <= event.occurred_at <= after
    assert event.occurred_at.tzinfo == timezone.utc


def test_onboarding_event_metadata_is_immutable_mapping():
    """Test OnboardingEvent metadata accepts immutable mapping."""
    frozen_metadata = {"key": "value"}
    event = OnboardingEvent(
        tenant_id="tenant-test",
        name="test.event",
        mode=OnboardingMode.DEMO,
        metadata=frozen_metadata,
    )

    assert event.metadata["key"] == "value"


def test_onboarding_event_supports_both_modes():
    """Test OnboardingEvent works with both DEMO and LIVE modes."""
    demo_event = OnboardingEvent(
        tenant_id="tenant-1",
        name="demo.event",
        mode=OnboardingMode.DEMO,
    )
    live_event = OnboardingEvent(
        tenant_id="tenant-2",
        name="live.event",
        mode=OnboardingMode.LIVE,
    )

    assert demo_event.mode == OnboardingMode.DEMO
    assert live_event.mode == OnboardingMode.LIVE


# ============================================================================
# record_onboarding_event Tests
# ============================================================================


def test_record_onboarding_event_emits_telemetry_with_correct_structure():
    """Test record_onboarding_event emits metrics with proper structure."""
    event = OnboardingEvent(
        tenant_id="tenant-abc",
        name="progress.loaded",
        mode=OnboardingMode.DEMO,
        metadata={"connectors": 3, "audits": 2},
        occurred_at=datetime(2025, 10, 20, 15, 30, 0, tzinfo=timezone.utc),
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        mock_emit.assert_called_once()
        args = mock_emit.call_args

        # Verify metric name
        assert args[0][0] == "onboarding.event"

        # Verify event data structure
        event_data = args[0][1]
        assert event_data["tenant_id"] == "tenant-abc"
        assert event_data["name"] == "progress.loaded"
        assert event_data["metadata"] == {"connectors": 3, "audits": 2}
        assert event_data["occurred_at"] == "2025-10-20T15:30:00+00:00"

        # Verify tags
        assert args[1]["tags"]["mode"] == "demo"


def test_record_onboarding_event_emits_demo_mode_tag():
    """Test record_onboarding_event tags DEMO mode events correctly."""
    event = OnboardingEvent(
        tenant_id="tenant-demo",
        name="demo.test",
        mode=OnboardingMode.DEMO,
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        tags = mock_emit.call_args[1]["tags"]
        assert tags["mode"] == "demo"


def test_record_onboarding_event_emits_live_mode_tag():
    """Test record_onboarding_event tags LIVE mode events correctly."""
    event = OnboardingEvent(
        tenant_id="tenant-live",
        name="live.test",
        mode=OnboardingMode.LIVE,
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        tags = mock_emit.call_args[1]["tags"]
        assert tags["mode"] == "live"


def test_record_onboarding_event_handles_empty_metadata():
    """Test record_onboarding_event handles events with no metadata."""
    event = OnboardingEvent(
        tenant_id="tenant-test",
        name="test.event",
        mode=OnboardingMode.DEMO,
        metadata={},
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["metadata"] == {}


def test_record_onboarding_event_handles_complex_metadata():
    """Test record_onboarding_event handles nested/complex metadata."""
    complex_metadata = {
        "connector_slug": "shopify",
        "stats": {
            "orders": 1234,
            "products": 567,
            "geocoded_ratio": 0.95,
        },
        "flags": ["initial_sync", "full_refresh"],
        "error": None,
    }

    event = OnboardingEvent(
        tenant_id="tenant-complex",
        name="connector.synced",
        mode=OnboardingMode.LIVE,
        metadata=complex_metadata,
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["metadata"]["connector_slug"] == "shopify"
        assert event_data["metadata"]["stats"]["orders"] == 1234
        assert event_data["metadata"]["flags"] == ["initial_sync", "full_refresh"]


def test_record_onboarding_event_converts_metadata_to_dict():
    """Test record_onboarding_event converts metadata Mapping to dict."""
    event = OnboardingEvent(
        tenant_id="tenant-test",
        name="test.event",
        mode=OnboardingMode.DEMO,
        metadata={"key": "value"},
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        # Metadata should be converted to dict for JSON serialization
        assert isinstance(event_data["metadata"], dict)


def test_record_onboarding_event_formats_occurred_at_as_iso():
    """Test record_onboarding_event formats timestamp as ISO 8601."""
    occurred_at = datetime(2025, 10, 20, 16, 45, 30, 123456, tzinfo=timezone.utc)
    event = OnboardingEvent(
        tenant_id="tenant-test",
        name="test.event",
        mode=OnboardingMode.DEMO,
        occurred_at=occurred_at,
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        # ISO format should include microseconds
        assert event_data["occurred_at"] == "2025-10-20T16:45:30.123456+00:00"


# ============================================================================
# Event Scenarios Tests
# ============================================================================


def test_record_progress_requested_event():
    """Test recording a progress.requested event."""
    event = OnboardingEvent(
        tenant_id="tenant-abc",
        name="progress.requested",
        mode=OnboardingMode.DEMO,
        metadata={"enabled": True},
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        assert mock_emit.called
        event_data = mock_emit.call_args[0][1]
        assert event_data["name"] == "progress.requested"


def test_record_progress_loaded_event():
    """Test recording a progress.loaded event with connector/audit counts."""
    event = OnboardingEvent(
        tenant_id="tenant-xyz",
        name="progress.loaded",
        mode=OnboardingMode.LIVE,
        metadata={
            "fallback_reason": None,
            "connectors": 4,
            "audits": 3,
            "generated_at": "2025-10-20T12:00:00Z",
        },
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["metadata"]["connectors"] == 4
        assert event_data["metadata"]["audits"] == 3


def test_record_progress_fallback_event():
    """Test recording a progress.fallback event."""
    event = OnboardingEvent(
        tenant_id="tenant-fail",
        name="progress.fallback",
        mode=OnboardingMode.LIVE,
        metadata={
            "fallback_reason": "live_progress_unavailable",
            "connectors": 0,
            "audits": 0,
        },
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["name"] == "progress.fallback"
        assert event_data["metadata"]["fallback_reason"] == "live_progress_unavailable"


def test_record_progress_error_event():
    """Test recording a progress.error event."""
    event = OnboardingEvent(
        tenant_id="tenant-error",
        name="progress.error",
        mode=OnboardingMode.LIVE,
        metadata={"message": "Network timeout"},
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["name"] == "progress.error"
        assert event_data["metadata"]["message"] == "Network timeout"


def test_record_connector_connected_event():
    """Test recording a connector.connected event."""
    event = OnboardingEvent(
        tenant_id="tenant-connect",
        name="connector.connected",
        mode=OnboardingMode.LIVE,
        metadata={
            "connector_slug": "shopify",
            "initial_sync": True,
        },
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["metadata"]["connector_slug"] == "shopify"


def test_record_audit_approved_event():
    """Test recording an audit.approved event."""
    event = OnboardingEvent(
        tenant_id="tenant-approve",
        name="audit.approved",
        mode=OnboardingMode.LIVE,
        metadata={
            "audit_id": "audit-shadow",
            "decision": "approved",
            "actor": "user@example.com",
        },
    )

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        event_data = mock_emit.call_args[0][1]
        assert event_data["name"] == "audit.approved"
        assert event_data["metadata"]["decision"] == "approved"


# ============================================================================
# Integration Tests
# ============================================================================


def test_end_to_end_telemetry_flow():
    """Integration test: Complete telemetry flow from event creation to emission."""
    # Step 1: Create event
    occurred_at = datetime(2025, 10, 20, 18, 0, 0, tzinfo=timezone.utc)
    event = OnboardingEvent(
        tenant_id="tenant-integration",
        name="integration.test",
        mode=OnboardingMode.LIVE,
        metadata={
            "test_id": "test-123",
            "step": "validation",
            "success": True,
        },
        occurred_at=occurred_at,
    )

    # Step 2: Record event
    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        record_onboarding_event(event)

        # Step 3: Verify telemetry was emitted correctly
        assert mock_emit.call_count == 1

        metric_name, event_data, tags_dict = (
            mock_emit.call_args[0][0],
            mock_emit.call_args[0][1],
            mock_emit.call_args[1],
        )

        assert metric_name == "onboarding.event"
        assert event_data["tenant_id"] == "tenant-integration"
        assert event_data["name"] == "integration.test"
        assert event_data["metadata"]["test_id"] == "test-123"
        assert event_data["metadata"]["success"] is True
        assert event_data["occurred_at"] == "2025-10-20T18:00:00+00:00"
        assert tags_dict["tags"]["mode"] == "live"


def test_multiple_events_in_sequence():
    """Test recording multiple events in sequence maintains independent state."""
    events = [
        OnboardingEvent(
            tenant_id="tenant-1",
            name="event.first",
            mode=OnboardingMode.DEMO,
            metadata={"order": 1},
        ),
        OnboardingEvent(
            tenant_id="tenant-2",
            name="event.second",
            mode=OnboardingMode.LIVE,
            metadata={"order": 2},
        ),
        OnboardingEvent(
            tenant_id="tenant-3",
            name="event.third",
            mode=OnboardingMode.DEMO,
            metadata={"order": 3},
        ),
    ]

    with patch("shared.services.onboarding.telemetry.metrics.emit") as mock_emit:
        for event in events:
            record_onboarding_event(event)

        assert mock_emit.call_count == 3

        # Verify each event was emitted with correct data
        calls = mock_emit.call_args_list
        assert calls[0][0][1]["tenant_id"] == "tenant-1"
        assert calls[0][0][1]["metadata"]["order"] == 1
        assert calls[1][0][1]["tenant_id"] == "tenant-2"
        assert calls[1][0][1]["metadata"]["order"] == 2
        assert calls[2][0][1]["tenant_id"] == "tenant-3"
        assert calls[2][0][1]["metadata"]["order"] == 3
