"""Tests for performance profiler."""

import json
import tempfile
import time
from pathlib import Path

import pytest

from apps.api.performance_profiler import (
    PerformanceProfiler,
    ComponentProfile,
    Bottleneck,
    ProfilingReport,
    create_mock_profiler_for_testing,
)


class TestComponentProfile:
    """Tests for ComponentProfile dataclass."""

    def test_mean_time_calculation(self):
        """Test mean latency calculation."""
        profile = ComponentProfile(
            name="test",
            operation="test_op",
            samples=4,
            total_time_ms=400.0,
        )
        assert profile.mean_time_ms == 100.0

    def test_mean_time_zero_samples(self):
        """Test mean time with zero samples."""
        profile = ComponentProfile(
            name="test",
            operation="test_op",
            samples=0,
            total_time_ms=0.0,
        )
        assert profile.mean_time_ms == 0.0

    def test_median_approximation(self):
        """Test median approximation."""
        profile = ComponentProfile(
            name="test",
            operation="test_op",
            samples=10,
            total_time_ms=1000.0,
        )
        median = profile.median_time_ms
        mean = profile.mean_time_ms
        assert median == mean * 0.9

    def test_p95_approximation(self):
        """Test P95 latency approximation."""
        profile = ComponentProfile(
            name="test",
            operation="test_op",
            samples=100,
            total_time_ms=10000.0,
            max_time_ms=200.0,
        )
        p95 = profile.p95_time_ms
        assert p95 == 200.0 * 0.8

    def test_p99_approximation(self):
        """Test P99 latency approximation."""
        profile = ComponentProfile(
            name="test",
            operation="test_op",
            samples=1000,
            total_time_ms=100000.0,
            max_time_ms=500.0,
        )
        p99 = profile.p99_time_ms
        assert p99 == 500.0 * 0.95


class TestBottleneck:
    """Tests for Bottleneck dataclass."""

    def test_bottleneck_creation(self):
        """Test bottleneck creation."""
        bottleneck = Bottleneck(
            rank=1,
            component="API:allocation",
            operation="allocate",
            metric="mean_latency_ms",
            current_value=1250.5,
            target_value=625.0,
            improvement_potential=50.0,
            effort="high",
        )
        assert bottleneck.rank == 1
        assert bottleneck.improvement_potential == 50.0


class TestPerformanceProfiler:
    """Tests for PerformanceProfiler class."""

    def test_profile_operation(self):
        """Test profiling a basic operation."""
        profiler = PerformanceProfiler()

        def slow_operation():
            time.sleep(0.01)
            return "result"

        result = profiler.profile_operation(
            "TEST",
            "operation",
            slow_operation,
        )
        assert result == "result"
        assert "TEST:operation" in profiler._profiles

    def test_multiple_samples(self):
        """Test multiple samples for same operation."""
        profiler = PerformanceProfiler()

        def operation():
            time.sleep(0.001)
            return None

        for _ in range(5):
            profiler.profile_operation("COMP", "op", operation)

        profile = profiler._profiles["COMP:op"]
        assert profile.samples == 5
        assert profile.total_time_ms > 0

    def test_profile_tracks_min_max(self):
        """Test that profiler tracks min/max latencies."""
        profiler = PerformanceProfiler()

        # Record different latencies
        profiler._record_sample("COMP:op", "COMP", "op", 10.0)
        profiler._record_sample("COMP:op", "COMP", "op", 20.0)
        profiler._record_sample("COMP:op", "COMP", "op", 15.0)

        profile = profiler._profiles["COMP:op"]
        assert profile.min_time_ms == 10.0
        assert profile.max_time_ms == 20.0
        assert profile.samples == 3

    def test_generate_report(self):
        """Test report generation."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        assert isinstance(report, ProfilingReport)
        assert report.components_profiled > 0
        assert report.total_samples > 0
        assert report.timestamp is not None

    def test_identifies_top_3_bottlenecks(self):
        """Test that profiler identifies top 3 bottlenecks."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        # Should have at most 3 bottlenecks
        assert len(report.bottlenecks) <= 3

        # Bottlenecks should be ranked
        for i, bottleneck in enumerate(report.bottlenecks):
            assert bottleneck.rank == i + 1

    def test_bottleneck_recommendations(self):
        """Test that bottlenecks include recommendations."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        for bottleneck in report.bottlenecks:
            assert bottleneck.recommendation
            assert bottleneck.effort in ["low", "medium", "high"]

    def test_recommendations_generated(self):
        """Test that recommendations are generated."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        assert len(report.recommendations) > 0

        for rec in report.recommendations:
            assert "priority" in rec
            assert "component" in rec
            assert "operation" in rec
            assert "improvement_potential_percent" in rec
            assert "estimated_effort" in rec

    def test_export_json(self):
        """Test exporting report to JSON."""
        profiler = create_mock_profiler_for_testing()

        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "profiling_report.json"
            profiler.export_json(filepath)

            assert filepath.exists()

            # Verify JSON is valid
            with open(filepath) as f:
                data = json.load(f)

            assert "timestamp" in data
            assert "components_profiled" in data
            assert "profiles" in data
            assert "bottlenecks" in data
            assert "recommendations" in data

    def test_json_export_includes_bottlenecks(self):
        """Test that JSON export includes bottleneck details."""
        profiler = create_mock_profiler_for_testing()

        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "profiling_report.json"
            profiler.export_json(filepath)

            with open(filepath) as f:
                data = json.load(f)

            # Should have at least one bottleneck
            assert len(data["bottlenecks"]) > 0

            # Check bottleneck structure
            for bottleneck in data["bottlenecks"]:
                assert "rank" in bottleneck
                assert "component" in bottleneck
                assert "operation" in bottleneck
                assert "current_value" in bottleneck
                assert "recommendation" in bottleneck

    def test_mock_profiler_bottlenecks(self):
        """Test that mock profiler identifies expected bottlenecks."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        # Should identify allocation, MMM training, or validation as bottlenecks
        bottleneck_ops = [b.operation for b in report.bottlenecks]

        # At least one bottleneck should be from slow operations
        assert any(
            op in bottleneck_ops
            for op in ["allocate", "train", "validate"]
        )

    def test_thread_safety(self):
        """Test thread-safe profiling."""
        import threading

        profiler = PerformanceProfiler()

        def record_samples():
            for i in range(50):
                profiler.profile_operation(
                    "COMP",
                    f"op_{i % 5}",
                    lambda: None,
                )

        threads = [threading.Thread(target=record_samples) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Total samples should be 50 * 3 = 150
        total_samples = sum(p.samples for p in profiler._profiles.values())
        assert total_samples == 150


class TestProfilingReport:
    """Tests for ProfilingReport."""

    def test_report_structure(self):
        """Test complete report structure."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        assert report.timestamp is not None
        assert report.duration_seconds >= 0
        assert report.components_profiled > 0
        assert report.total_samples > 0
        assert isinstance(report.profiles, list)
        assert isinstance(report.bottlenecks, list)
        assert isinstance(report.recommendations, list)

    def test_metadata_included(self):
        """Test that metadata is included."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        assert "profiler_version" in report.metadata
        assert "python_version" in report.metadata


class TestMockProfiler:
    """Tests for mock profiler utility."""

    def test_mock_profiler_creates_realistic_data(self):
        """Test that mock profiler creates realistic profiles."""
        profiler = create_mock_profiler_for_testing()

        # Should have multiple profiles
        assert len(profiler._profiles) > 5

        # Check realistic component names
        components = {p.split(":")[0] for p in profiler._profiles.keys()}
        assert "API" in components
        assert "MODEL" in components

    def test_mock_profiler_identifies_allocation_bottleneck(self):
        """Test that mock profiler identifies allocation as bottleneck."""
        profiler = create_mock_profiler_for_testing()
        report = profiler.generate_report()

        # Allocation should be in top bottlenecks (high latency)
        bottleneck_components = [b.component for b in report.bottlenecks]
        assert any(c in ["API", "MODEL"] for c in bottleneck_components)
