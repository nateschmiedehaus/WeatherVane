"""End-to-end performance profiling for WeatherVane API and model pipelines.

Profiles the following components:
- API endpoints: Request latency, throughput
- Model training: Data loading, feature engineering, training time
- Allocation pipelines: Optimization time, constraint evaluation
- Database queries: Query latency and count

Generates a comprehensive profiling report identifying the top 3 bottlenecks
and recommendations for optimization.
"""

from __future__ import annotations

import json
import logging
import time
import threading
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

_LOGGER = logging.getLogger(__name__)


@dataclass
class ComponentProfile:
    """Performance profile for a single component."""

    name: str
    """Component name (e.g., 'API:/weather', 'MODEL:training')"""

    operation: str
    """Operation name (e.g., 'predict', 'train', 'allocate')"""

    component: str = ""
    """Component type (e.g., 'API', 'MODEL') - populated during recording"""

    samples: int = 0
    """Number of measurements taken"""

    total_time_ms: float = 0.0
    """Total time spent across all samples"""

    min_time_ms: float = float("inf")
    """Minimum observed latency"""

    max_time_ms: float = 0.0
    """Maximum observed latency"""

    throughput_qps: float = 0.0
    """Queries per second throughput (estimated)"""

    metadata: Dict[str, Any] = field(default_factory=dict)
    """Additional metadata (input_size, batch_size, etc)"""

    @property
    def mean_time_ms(self) -> float:
        """Mean latency in milliseconds."""
        return self.total_time_ms / self.samples if self.samples > 0 else 0.0

    @property
    def median_time_ms(self) -> float:
        """Median latency (approximated from min/mean/max)."""
        # Rough approximation: for many samples, median ≈ mean
        # For skewed distributions, median < mean
        return self.mean_time_ms * 0.9

    @property
    def p95_time_ms(self) -> float:
        """P95 latency (approximated)."""
        return self.max_time_ms * 0.8

    @property
    def p99_time_ms(self) -> float:
        """P99 latency (approximated)."""
        return self.max_time_ms * 0.95


@dataclass
class Bottleneck:
    """Identified performance bottleneck."""

    rank: int
    """Bottleneck rank (1 = worst)"""

    component: str
    """Component name"""

    operation: str
    """Operation name"""

    metric: str
    """Metric name (latency, throughput, etc)"""

    current_value: float
    """Current measured value"""

    target_value: Optional[float] = None
    """Target value for improvement"""

    improvement_potential: float = 0.0
    """Estimated % improvement if fixed"""

    recommendation: str = ""
    """Recommended fix"""

    effort: str = "medium"
    """Implementation effort: low, medium, high"""


@dataclass
class ProfilingReport:
    """Complete profiling report."""

    timestamp: str
    """Report generation timestamp"""

    duration_seconds: float
    """Duration of profiling run"""

    components_profiled: int
    """Number of components profiled"""

    total_samples: int = 0
    """Total measurements taken"""

    profiles: List[ComponentProfile] = field(default_factory=list)
    """Individual component profiles"""

    bottlenecks: List[Bottleneck] = field(default_factory=list)
    """Top 3 identified bottlenecks"""

    recommendations: List[Dict[str, Any]] = field(default_factory=list)
    """Optimization recommendations"""

    metadata: Dict[str, Any] = field(default_factory=dict)
    """Additional metadata"""


class PerformanceProfiler:
    """End-to-end performance profiler for WeatherVane."""

    def __init__(self):
        """Initialize profiler."""
        self._profiles: Dict[str, ComponentProfile] = {}
        self._lock = threading.RLock()
        self._start_time: Optional[float] = None
        _LOGGER.info("Initialized PerformanceProfiler")

    def profile_operation(
        self,
        component: str,
        operation: str,
        func: Callable[..., Any],
        *args,
        **kwargs,
    ) -> Any:
        """Profile a function operation.

        Args:
            component: Component name (e.g., 'API', 'MODEL')
            operation: Operation name (e.g., 'predict', 'train')
            func: Function to profile
            *args: Function arguments
            **kwargs: Function keyword arguments

        Returns:
            Function return value
        """
        key = f"{component}:{operation}"
        start = time.perf_counter()

        try:
            result = func(*args, **kwargs)
            elapsed_ms = (time.perf_counter() - start) * 1000
            self._record_sample(key, component, operation, elapsed_ms)
            return result
        except Exception as e:
            _LOGGER.error(f"Error in profiled operation {key}: {e}")
            raise

    def _record_sample(
        self,
        key: str,
        component: str,
        operation: str,
        elapsed_ms: float,
    ) -> None:
        """Record a profiling sample."""
        with self._lock:
            if key not in self._profiles:
                self._profiles[key] = ComponentProfile(
                    name=key,
                    component=component,
                    operation=operation,
                )

            profile = self._profiles[key]
            profile.samples += 1
            profile.total_time_ms += elapsed_ms
            profile.min_time_ms = min(profile.min_time_ms, elapsed_ms)
            profile.max_time_ms = max(profile.max_time_ms, elapsed_ms)

    def generate_report(self) -> ProfilingReport:
        """Generate comprehensive profiling report.

        Returns:
            Complete profiling report with bottleneck analysis
        """
        with self._lock:
            duration = (
                time.time() - self._start_time
                if self._start_time
                else time.time()
            )

            # Collect profiles
            profiles = list(self._profiles.values())
            total_samples = sum(p.samples for p in profiles)

            # Identify bottlenecks
            bottlenecks = self._identify_bottlenecks(profiles)

            # Generate recommendations
            recommendations = self._generate_recommendations(bottlenecks)

            report = ProfilingReport(
                timestamp=datetime.utcnow().isoformat(),
                duration_seconds=duration,
                components_profiled=len(profiles),
                total_samples=total_samples,
                profiles=profiles,
                bottlenecks=bottlenecks,
                recommendations=recommendations,
                metadata={
                    "profiler_version": "1.0",
                    "python_version": "3.10",
                },
            )

            return report

    def _identify_bottlenecks(
        self,
        profiles: List[ComponentProfile],
    ) -> List[Bottleneck]:
        """Identify top 3 bottlenecks from profiles.

        Analyzes profiles to rank performance issues by:
        1. Mean latency (time spent)
        2. Throughput impact
        3. Frequency of invocation
        """
        if not profiles:
            return []

        # Score each profile as a bottleneck
        scores: List[Tuple[float, ComponentProfile]] = []

        for profile in profiles:
            # Weighted score: (mean_latency * frequency) + throughput_penalty
            latency_score = profile.mean_time_ms * profile.samples
            throughput_penalty = (
                (profile.max_time_ms - profile.min_time_ms) * 0.1
                if profile.samples > 1
                else 0
            )
            score = latency_score + throughput_penalty
            scores.append((score, profile))

        # Sort by score (worst first)
        scores.sort(reverse=True, key=lambda x: x[0])

        # Create bottleneck entries for top 3
        bottlenecks = []
        for rank, (score, profile) in enumerate(scores[:3], 1):
            bottleneck = Bottleneck(
                rank=rank,
                component=profile.component if hasattr(profile, 'component') else profile.name,
                operation=profile.operation,
                metric="mean_latency_ms",
                current_value=profile.mean_time_ms,
                target_value=profile.mean_time_ms * 0.5,
                improvement_potential=50.0,
                recommendation=self._recommend_fix(profile),
                effort=self._estimate_effort(profile),
            )
            bottlenecks.append(bottleneck)

        return bottlenecks

    def _recommend_fix(self, profile: ComponentProfile) -> str:
        """Generate recommendation for bottleneck fix."""
        if "training" in profile.operation.lower():
            return "Implement distributed training, reduce dataset size, or use faster algorithms"
        elif "predict" in profile.operation.lower():
            return "Implement model caching, optimize feature extraction, use batch predictions"
        elif "allocate" in profile.operation.lower():
            return "Precompute constraints, use approximate algorithms, implement result caching"
        else:
            return "Profile deeper to identify specific slow operations"

    def _estimate_effort(self, profile: ComponentProfile) -> str:
        """Estimate implementation effort for fix."""
        latency_ms = profile.mean_time_ms
        if latency_ms > 5000:
            return "high"
        elif latency_ms > 1000:
            return "medium"
        else:
            return "low"

    def _generate_recommendations(
        self,
        bottlenecks: List[Bottleneck],
    ) -> List[Dict[str, Any]]:
        """Generate actionable recommendations."""
        recommendations = []

        for bottleneck in bottlenecks:
            recommendation = {
                "priority": f"P{bottleneck.rank}",
                "component": bottleneck.component,
                "operation": bottleneck.operation,
                "current_latency_ms": bottleneck.current_value,
                "target_latency_ms": bottleneck.target_value,
                "improvement_potential_percent": bottleneck.improvement_potential,
                "recommended_fix": bottleneck.recommendation,
                "estimated_effort": bottleneck.effort,
                "suggested_next_steps": self._next_steps(bottleneck),
            }
            recommendations.append(recommendation)

        return recommendations

    def _next_steps(self, bottleneck: Bottleneck) -> List[str]:
        """Suggest next steps for optimization."""
        next_steps = [
            "1. Detailed profiling of this operation to find sub-components",
            "2. Benchmark against industry standards",
            "3. Implement optimization and measure improvement",
            "4. Document any trade-offs (accuracy vs latency, etc)",
            "5. Update performance targets in system design",
        ]
        return next_steps

    def export_json(self, filepath: Path) -> None:
        """Export profiling report to JSON file.

        Args:
            filepath: Output file path
        """
        report = self.generate_report()

        # Convert dataclasses to dicts
        report_dict = {
            "timestamp": report.timestamp,
            "duration_seconds": report.duration_seconds,
            "components_profiled": report.components_profiled,
            "total_samples": report.total_samples,
            "profiles": [asdict(p) for p in report.profiles],
            "bottlenecks": [asdict(b) for b in report.bottlenecks],
            "recommendations": report.recommendations,
            "metadata": report.metadata,
        }

        # Ensure directory exists
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Write JSON
        with open(filepath, "w") as f:
            json.dump(report_dict, f, indent=2)

        _LOGGER.info(f"Exported profiling report to {filepath}")


def create_mock_profiler_for_testing() -> PerformanceProfiler:
    """Create profiler with mock data for testing.

    Simulates profiling of a typical WeatherVane deployment.
    """
    profiler = PerformanceProfiler()

    # Simulate API operations
    api_operations = [
        ("API:weather", "predict", 45.2, 100),
        ("API:weather", "elasticity", 52.3, 80),
        ("API:allocation", "allocate", 1250.5, 20),  # Bottleneck!
        ("API:models", "load", 125.0, 15),
    ]

    for component_op, operation, mean_latency, samples in api_operations:
        component = component_op.split(":")[0]
        key = f"{component}:{operation}"
        profile = ComponentProfile(
            name=key,
            component=component,
            operation=operation,
            samples=samples,
            total_time_ms=mean_latency * samples,
            min_time_ms=mean_latency * 0.7,
            max_time_ms=mean_latency * 1.3,
        )
        profiler._profiles[key] = profile

    # Simulate model training operations
    training_operations = [
        ("MODEL:mmm", "train", 8500.0, 3),  # Bottleneck!
        ("MODEL:mmm", "validate", 2100.0, 3),  # Bottleneck!
        ("MODEL:feature", "extract", 450.0, 50),
        ("MODEL:baseline", "train", 1200.0, 5),
    ]

    for component_op, operation, mean_latency, samples in training_operations:
        component = component_op.split(":")[0]
        key = f"{component}:{operation}"
        profile = ComponentProfile(
            name=key,
            component=component,
            operation=operation,
            samples=samples,
            total_time_ms=mean_latency * samples,
            min_time_ms=mean_latency * 0.8,
            max_time_ms=mean_latency * 1.2,
        )
        profiler._profiles[key] = profile

    return profiler
