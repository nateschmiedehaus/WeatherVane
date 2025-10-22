#!/usr/bin/env python3
"""
Causal Critic Runtime
---------------------

This critic verifies that our causal inference toolchain remains healthy:
- Confirms the weather shock estimator and uplift modules are present.
- Runs their targeted regression tests.
- Validates cached uplift artifacts for statistical sanity.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, List, Optional


@dataclass
class Finding:
    severity: str
    message: str
    details: Optional[str] = None


DISCLOSURE_MARKERS = [
    "predictions reflect historical correlations",
    "causal lift under validation",
    "causal limitations",
]


def _tail_output(*chunks: str, limit: int = 12) -> str:
    lines: List[str] = []
    for chunk in chunks:
        if not chunk:
            continue
        lines.extend(chunk.strip().splitlines())
    if not lines:
        return ""
    return "\n".join(lines[-limit:])


def _append_pythonpath(env: dict[str, str], root: Path) -> None:
    existing = env.get("PYTHONPATH")
    if existing:
        env["PYTHONPATH"] = f"{root}{os.pathsep}{existing}"
    else:
        env["PYTHONPATH"] = str(root)


def _run_pytest(root: Path, target: str, env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    cmd = [sys.executable, "-m", "pytest", target, "-q"]
    return subprocess.run(cmd, cwd=str(root), env=env, text=True, capture_output=True)


def check_causal_docs(root: Path) -> Iterable[Finding]:
    doc_path = root / "docs" / "CAUSAL_LIMITATIONS.md"
    if not doc_path.exists():
        yield Finding(
            severity="CRITICAL",
            message="Causal limitations disclosure missing.",
            details=f"Expected {doc_path} to outline disclosure and disclaimers.",
        )
        return

    text = doc_path.read_text(encoding="utf-8").lower()
    missing = [marker for marker in DISCLOSURE_MARKERS if marker not in text]
    if missing:
        yield Finding(
            severity="CRITICAL",
            message="Causal limitations doc missing required disclosure.",
            details=f"Missing markers: {', '.join(missing)}",
        )


def check_weather_service_integration(root: Path) -> Iterable[Finding]:
    service_path = root / "apps" / "api" / "services" / "weather_service.py"
    if not service_path.exists():
        yield Finding(
            severity="CRITICAL",
            message="Weather service module missing.",
            details=f"Expected DID integration at {service_path}",
        )
        return

    text = service_path.read_text(encoding="utf-8")
    if "estimate_weather_shock_effect" not in text:
        yield Finding(
            severity="CRITICAL",
            message="Weather API still bypasses the DID estimator.",
            details="weather_service.analyze_weather_shock must call shared.libs.causal.estimate_weather_shock_effect.",
        )


def evaluate_synthetic_report(root: Path) -> Iterable[Finding]:
    module_path = root / "apps" / "model" / "causal_uplift.py"
    if not module_path.exists():
        yield Finding(
            severity="CRITICAL",
            message="Causal uplift module missing.",
            details=f"Expected uplift implementation at {module_path}",
        )
        return

    spec = importlib.util.spec_from_file_location("_causal_uplift_for_critic", module_path)
    if spec is None or spec.loader is None:
        yield Finding(
            severity="CRITICAL",
            message="Unable to import causal uplift module.",
            details=f"spec_from_file_location failed for {module_path}",
        )
        return

    module = importlib.util.module_from_spec(spec)
    try:
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)  # type: ignore[assignment]
    except Exception as exc:  # pragma: no cover - defensive
        yield Finding(
            severity="CRITICAL",
            message="Causal uplift module import failed.",
            details=f"{type(exc).__name__}: {exc}",
        )
        return
    finally:
        sys.modules.pop(spec.name, None)

    if not hasattr(module, "compute_synthetic_report"):
        yield Finding(
            severity="CRITICAL",
            message="Synthetic uplift report hook missing.",
            details="Define compute_synthetic_report() returning IncrementalLiftReport.",
        )
        return

    try:
        report = module.compute_synthetic_report()
    except Exception as exc:  # pragma: no cover - defensive
        yield Finding(
            severity="CRITICAL",
            message="Synthetic uplift report generation failed.",
            details=f"{type(exc).__name__}: {exc}",
        )
        return

    normalized_qini = getattr(report, "normalized_qini", None)
    if normalized_qini is None:
        yield Finding(
            severity="CRITICAL",
            message="Synthetic uplift report missing normalized QINI.",
            details="compute_synthetic_report must expose normalized_qini for critic validation.",
        )
    elif isinstance(normalized_qini, (int, float)) and normalized_qini < 0:
        yield Finding(
            severity="CRITICAL",
            message="Synthetic uplift report flagged negative QINI.",
            details=f"Normalized QINI {normalized_qini:.4f} indicates uplift regression.",
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run causal critic checks.")
    parser.add_argument(
        "--level",
        choices=["medium", "high"],
        default="medium",
        help="Capability profile used to tune critic depth.",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[3]
    findings: List[Finding] = []
    critical = False

    def record_finding(finding: Finding) -> None:
        nonlocal critical
        severity = finding.severity.upper()
        findings.append(Finding(severity=severity, message=finding.message, details=finding.details))
        if severity == "CRITICAL":
            critical = True

    def record(severity: str, message: str, details: Optional[str] = None) -> None:
        record_finding(Finding(severity=severity, message=message, details=details))

    weather_module = root / "shared" / "libs" / "causal" / "weather_shock.py"
    uplift_module = root / "apps" / "model" / "causal_uplift.py"
    weather_tests = root / "tests" / "shared" / "libs" / "causal" / "test_weather_shock.py"
    uplift_tests = root / "tests" / "apps" / "model" / "test_causal_uplift.py"
    uplift_report = root / "experiments" / "causal" / "uplift_report.json"

    if not weather_module.exists():
        record(
            "CRITICAL",
            "Weather shock estimator missing.",
            f"Expected module at {weather_module}",
        )
    else:
        text = weather_module.read_text(encoding="utf-8")
        if "estimate_weather_shock_effect" not in text:
            record(
                "CRITICAL",
                "Weather shock estimator missing export.",
                "Function `estimate_weather_shock_effect` not found in shared.libs.causal.weather_shock.",
            )
        else:
            record("INFO", "Weather shock estimator present.", None)

    if not uplift_module.exists():
        record(
            "CRITICAL",
            "Causal uplift module missing.",
            f"Expected module at {uplift_module}",
        )

    if not weather_tests.exists():
        record(
            "CRITICAL",
            "Weather shock regression tests missing.",
            f"Expected test file at {weather_tests}",
        )

    if not uplift_tests.exists():
        record(
            "CRITICAL",
            "Causal uplift regression tests missing.",
            f"Expected test file at {uplift_tests}",
        )

    env = os.environ.copy()
    _append_pythonpath(env, root)

    if weather_tests.exists():
        result = _run_pytest(root, str(weather_tests.relative_to(root)), env)
        summary = _tail_output(result.stdout, result.stderr)
        if result.returncode != 0:
            record(
                "CRITICAL",
                "Weather shock tests failing.",
                summary or "pytest reported failures for weather shock suite.",
            )
        else:
            record(
                "INFO",
                "Weather shock tests passed.",
                summary,
            )

    if uplift_tests.exists():
        result = _run_pytest(root, str(uplift_tests.relative_to(root)), env)
        summary = _tail_output(result.stdout, result.stderr)
        if result.returncode != 0:
            record(
                "CRITICAL",
                "Causal uplift tests failing.",
                summary or "pytest reported failures for causal uplift suite.",
            )
        else:
            record(
                "INFO",
                "Causal uplift tests passed.",
                summary,
            )

    if uplift_report.exists():
        try:
            report = json.loads(uplift_report.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            record(
                "CRITICAL",
                "Uplift report invalid JSON.",
                f"{uplift_report}: {exc}",
            )
        else:
            missing_top = [key for key in ("headline", "deciles") if key not in report]
            if missing_top:
                record(
                    "CRITICAL",
                    "Uplift report missing required sections.",
                    f"Missing keys: {', '.join(missing_top)}",
                )
            else:
                headline = report.get("headline", {})
                key_gaps = [key for key in ("predicted_ate", "observed_ate", "p_value", "conf_low", "conf_high") if key not in headline]
                if key_gaps:
                    record(
                        "WARNING",
                        "Uplift headline missing metrics.",
                        f"Missing keys: {', '.join(key_gaps)}",
                    )
                p_value = headline.get("p_value")
                if isinstance(p_value, (int, float)) and p_value > 0.05:
                    record(
                        "WARNING",
                        "Uplift report not statistically significant.",
                        f"Observed p-value {p_value:.4f}",
                    )
                deciles = report.get("deciles")
                if not isinstance(deciles, list) or len(deciles) < 5:
                    record(
                        "WARNING",
                        "Uplift report decile analysis thin.",
                        "Expected 10 deciles with uplift signals.",
                    )
                else:
                    record(
                        "INFO",
                        "Uplift report structure looks healthy.",
                        f"{len(deciles)} deciles reported; p-value={p_value}",
                    )
    else:
        severity = "WARNING" if args.level == "medium" else "CRITICAL"
        record(
            severity,
            "Causal uplift artifact missing.",
            f"Expected cached report at {uplift_report}",
        )

    for finding in check_causal_docs(root):
        record_finding(finding)

    for finding in check_weather_service_integration(root):
        record_finding(finding)

    for finding in evaluate_synthetic_report(root):
        record_finding(finding)

    payload = {
        "status": "failed" if critical else "passed",
        "level": args.level,
        "findings": [asdict(f) for f in findings],
        "critical_count": sum(1 for f in findings if f.severity == "CRITICAL"),
        "warning_count": sum(1 for f in findings if f.severity == "WARNING"),
        "info_count": sum(1 for f in findings if f.severity == "INFO"),
    }

    print(json.dumps(payload, indent=2))
    sys.exit(1 if critical else 0)


if __name__ == "__main__":
    main()
