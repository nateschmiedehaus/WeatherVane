#!/usr/bin/env python3
"""
ML Task Meta-Critic

Aggregates previously completed ML tasks and produces a quality report that
mirrors the TypeScript fallback implementation. This script is the primary
analysis path invoked by the MLTaskMetaCritic critic. It can emit a formatted
human-readable report or JSON for downstream tooling.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional
import time

ROOT = Path(__file__).parent.parent.parent.parent
DOCS_DIR = ROOT / "docs"
STATE_DIR = ROOT / "state"


# ----------------------------- Data Structures ----------------------------- #


@dataclass
class MLTaskSummary:
    id: str
    title: str
    status: str
    completion_path: Optional[Path] = None
    metadata: Optional[Dict[str, object]] = None


@dataclass
class CriticResultDetails:
    passed: bool
    message: Optional[str] = None


@dataclass
class MLTaskCompletionReport:
    id: str
    title: str
    completion_path: str
    extracted_at: int
    deliverables: List[str]
    quality_metrics: Dict[str, float]
    tests_passed: bool
    test_count: Optional[int]
    coverage_dimensions: Optional[int]
    artifacts_generated: List[str]
    verification_checklist: Dict[str, bool]
    critic_results: Dict[str, CriticResultDetails]


@dataclass
class AggregatedMLTasksReport:
    total_tasks_analyzed: int
    completed_tasks: int
    in_progress_tasks: int
    failed_tasks: int
    average_completion_rate: float
    tasks: List[MLTaskCompletionReport]
    analysis_timestamp: int
    blockers_detected: List[str]
    patterns_observed: List[str]


# ------------------------------ Core Utilities ----------------------------- #


def _find_completion_reports(base: Path) -> Iterable[Path]:
    if not base.exists():
        return []

    for path in base.rglob("*COMPLETION*"):
        if path.is_file() and path.suffix.lower() == ".md":
            # Skip common heavy directories early
            if ".git" in path.parts or "node_modules" in path.parts:
                continue
            yield path


def _extract_task_id(file_path: Path) -> str:
    patterns = [
        r"(T-[A-Z]+-[\d.]+)",
        r"(T\d+(?:\.\d+)*)",
        r"(TASK_[A-Z0-9\-_.]+)",
    ]
    name = file_path.name
    for pattern in patterns:
        match = re.search(pattern, name, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return file_path.stem


def _extract_title(file_path: Path) -> str:
    title = file_path.stem
    title = title.replace("_", " ").replace("-", " ")
    title = re.sub(r"COMPLETION\s*REPORT", "", title, flags=re.IGNORECASE)
    return title.strip()


def _load_state_tasks() -> List[MLTaskSummary]:
    metrics_path = STATE_DIR / "analytics" / "orchestration_metrics.json"
    if not metrics_path.exists():
        return []

    try:
        content = json.loads(metrics_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    decisions = content.get("decisions", [])
    tasks: List[MLTaskSummary] = []
    for decision in decisions:
        related = decision.get("related_tasks")
        if not isinstance(related, list):
            continue
        for task_id in related:
            if not isinstance(task_id, str):
                continue
            tasks.append(
                MLTaskSummary(
                    id=task_id,
                    title=decision.get("topic") or "Unknown",
                    status="done",
                    metadata={"source": "state_decision"},
                )
            )
    return tasks


def _merge_tasks(
    primary: Iterable[MLTaskSummary], secondary: Iterable[MLTaskSummary]
) -> List[MLTaskSummary]:
    merged: Dict[str, MLTaskSummary] = {}
    for task in primary:
        merged[task.id] = task
    for task in secondary:
        existing = merged.get(task.id)
        if existing:
            metadata = dict(existing.metadata or {})
            metadata.update(task.metadata or {})
            merged[task.id] = MLTaskSummary(
                id=task.id,
                title=task.title or existing.title,
                status=task.status or existing.status,
                completion_path=task.completion_path or existing.completion_path,
                metadata=metadata or None,
            )
        else:
            merged[task.id] = task
    return list(merged.values())


# --------------------------- Markdown Parsing ------------------------------ #


def _extract_section(content: str, heading: str) -> Optional[str]:
    pattern = re.compile(
        rf"##?\s*{re.escape(heading)}\s*:?\n([\s\S]*?)(?=\n##|\Z)",
        flags=re.IGNORECASE,
    )
    match = pattern.search(content)
    if not match:
        return None
    return match.group(1).strip()


def _extract_deliverables(content: str) -> List[str]:
    section = _extract_section(content, "Deliverables")
    if not section:
        return []
    items = re.findall(r"[-*]\s*(.+?)(?=\n[-*]|\n##|\Z)", section)
    return [item.strip() for item in items if item.strip()]


def _extract_quality_metrics(content: str) -> Dict[str, float]:
    patterns = {
        "build_success_rate": re.compile(r"Build.*?(\d+)%?", flags=re.IGNORECASE),
        "test_coverage": re.compile(r"Coverage.*?(\d+)%?", flags=re.IGNORECASE),
        "lint_score": re.compile(r"Lint.*?(\d+)", flags=re.IGNORECASE),
        "security_score": re.compile(r"Security.*?(\d+)", flags=re.IGNORECASE),
        "performance_score": re.compile(r"Performance.*?(\d+)", flags=re.IGNORECASE),
    }
    metrics: Dict[str, float] = {}
    for key, pattern in patterns.items():
        match = pattern.search(content)
        if match:
            try:
                metrics[key] = float(match.group(1))
            except (TypeError, ValueError):
                continue
    return metrics


def _extract_tests_passed(content: str) -> bool:
    failing_patterns = [
        r"tests?.*?(?:failed|✗|✘)",
        r"❌.*?tests?",
        r"FAIL",
    ]
    for pattern in failing_patterns:
        if re.search(pattern, content, flags=re.IGNORECASE):
            return False

    passing_patterns = [
        r"all tests.*?(?:passed|✅|✓)",
        r"tests?.*?(?:PASS|✅|✓)",
        r"✅.*?tests?",
    ]
    for pattern in passing_patterns:
        if re.search(pattern, content, flags=re.IGNORECASE):
            return True
    return False


def _extract_test_count(content: str) -> Optional[int]:
    match = re.search(r"(\d+)\s*(?:tests?|test cases?)", content, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return None


def _extract_coverage_dimensions(content: str) -> int:
    patterns = [
        r"code.*?elegance",
        r"architecture",
        r"user.*?experience",
        r"communication",
        r"scientific.*?rigor",
        r"performance",
        r"security",
    ]
    count = 0
    lowered = content.lower()
    for pattern in patterns:
        if re.search(pattern, lowered):
            count += 1
    return count


def _extract_artifacts(content: str) -> List[str]:
    artifacts: List[str] = []
    section = _extract_section(content, "Artifacts")
    if section:
        items = re.findall(r"[-*]\s*(`[^`]+`|[^\n]+)", section)
        for item in items:
            cleaned = item.strip().lstrip("-* ").strip()
            if cleaned:
                artifacts.append(cleaned)

    file_refs = re.findall(r"(?:^|\n)\s*`([./\w-]+\.[A-Za-z0-9]+)`", content)
    for ref in file_refs:
        cleaned = ref.strip()
        if cleaned and cleaned not in artifacts:
            artifacts.append(cleaned)
    return artifacts


def _extract_verification_checklist(content: str) -> Dict[str, bool]:
    items = [
        ("build", [r"Build.*?(?:✅|✓|pass|success)"], [r"Build.*?(?:✗|✘|fail|error)"]),
        (
            "tests",
            [r"Tests?.*?(?:✅|✓|pass|passed|success)", r"all.*tests.*(?:✅|✓|pass|passed)"],
            [r"Tests?.*?(?:✗|✘|fail|failed|error)"],
        ),
        (
            "audit",
            [r"Audit.*?(?:✅|✓|pass|no issues|success)"],
            [r"Audit.*?(?:✗|✘|fail|error|vulnerab)"],
        ),
        (
            "documentation",
            [r"Documentation.*?(?:✅|✓|complete|done)"],
            [r"Documentation.*?(?:✗|✘|incomplete|missing)"],
        ),
        (
            "performance",
            [r"Performance.*?(?:✅|✓|pass|ok|good)"],
            [r"Performance.*?(?:✗|✘|fail|regression|slow)"],
        ),
    ]

    checklist: Dict[str, bool] = {}
    for name, pass_patterns, fail_patterns in items:
        has_pass = any(
            re.search(pattern, content, flags=re.IGNORECASE) for pattern in pass_patterns
        )
        has_fail = any(
            re.search(pattern, content, flags=re.IGNORECASE) for pattern in fail_patterns
        )
        if has_fail:
            checklist[name] = False
        elif has_pass:
            checklist[name] = True
    return checklist


def _extract_critic_results(content: str) -> Dict[str, CriticResultDetails]:
    critic_sections = [
        (
            "modeling_reality_v2",
            re.compile(r"Modeling Reality.*?(✅|✓|pass|fail|✗|✘)", flags=re.IGNORECASE),
            re.compile(r"Model accuracy.*?(\d+)%", flags=re.IGNORECASE),
        ),
        (
            "academic_rigor",
            re.compile(r"Academic Rigor.*?(✅|✓|pass|fail|✗|✘)", flags=re.IGNORECASE),
            re.compile(r"Methodology.*?(valid|invalid|incomplete)", flags=re.IGNORECASE),
        ),
        (
            "data_quality",
            re.compile(r"Data Quality.*?(✅|✓|pass|fail|✗|✘)", flags=re.IGNORECASE),
            re.compile(r"Data.*?(valid|corrupt|incomplet)", flags=re.IGNORECASE),
        ),
    ]

    results: Dict[str, CriticResultDetails] = {}
    for name, status_pattern, detail_pattern in critic_sections:
        status_match = status_pattern.search(content)
        detail_match = detail_pattern.search(content)
        if status_match or detail_match:
            status_text = status_match.group(1).lower() if status_match else ""
            passed = bool(re.search(r"(✅|✓|pass|valid)", status_text))
            message: Optional[str] = None
            if detail_match:
                group_val = detail_match.group(1)
                if name == "modeling_reality_v2":
                    message = f"{group_val}%"
                else:
                    message = group_val
            results[name] = CriticResultDetails(passed=passed, message=message)
    return results


# ----------------------------- Task Processing ----------------------------- #


def _classify_task_status(task: MLTaskSummary, report: Optional[MLTaskCompletionReport]) -> str:
    if report and report.tests_passed:
        return "completed"
    if report and not report.tests_passed:
        return "failed"

    status = (task.status or "").lower()
    if re.search(r"(in[\s_-]?progress|active|working|running|ongoing)", status):
        return "in_progress"
    if re.search(r"(done|completed|complete|success|shipped|closed)", status):
        return "completed"
    if re.search(r"(fail|blocked|error|abandon|cancel|halt|stuck|invalid)", status):
        return "failed"
    return "failed"


def _detect_blockers(reports: Iterable[MLTaskCompletionReport]) -> List[str]:
    blockers: List[str] = []
    for report in reports:
        critic_results = report.critic_results or {}
        modeling = critic_results.get("modeling_reality_v2")
        if modeling and not modeling.passed:
            blockers.append(f"Model accuracy {modeling.message or 'failed'}")
        academic = critic_results.get("academic_rigor")
        if academic and not academic.passed:
            blockers.append("Methodology incomplete")
        data_quality = critic_results.get("data_quality")
        if data_quality and not data_quality.passed:
            blockers.append("Data corrupted")

        failed_checks = [
            name for name, passed in report.verification_checklist.items() if not passed
        ]
        if failed_checks:
            blockers.append(f"Task {report.id} failed checks: {', '.join(failed_checks)}")

        if (report.coverage_dimensions or 0) < 4:
            blockers.append(
                f"Task {report.id} has incomplete test coverage ({report.coverage_dimensions or 0}/7 dimensions)"
            )

        if not report.artifacts_generated:
            blockers.append(f"Task {report.id} has no documented artifacts")

    seen = set()
    deduped = []
    for blocker in blockers:
        if blocker not in seen:
            seen.add(blocker)
            deduped.append(blocker)
    return deduped


def _observe_patterns(reports: List[MLTaskCompletionReport]) -> List[str]:
    patterns: List[str] = []
    if not reports:
        return patterns

    avg_completion = sum(1 for r in reports if r.tests_passed) / len(reports)
    if avg_completion < 0.8:
        patterns.append(f"Low completion rate: {(avg_completion * 100):.1f}% of tasks passing")

    avg_dimensions = sum(r.coverage_dimensions or 0 for r in reports) / len(reports)
    if avg_dimensions < 4:
        patterns.append(f"Limited test coverage: average {avg_dimensions:.1f}/7 dimensions")

    without_artifacts = sum(1 for r in reports if not r.artifacts_generated)
    if without_artifacts > 0:
        patterns.append(f"{without_artifacts} tasks lack documented artifacts")

    failure_freq: Dict[str, int] = {}
    for report in reports:
        for check, passed in report.verification_checklist.items():
            if not passed:
                failure_freq[check] = failure_freq.get(check, 0) + 1
    recurring = [f"{check} verification" for check, count in failure_freq.items() if count >= 2][:3]
    if recurring:
        patterns.append(f"Recurring verification failures: {', '.join(recurring)}")

    return patterns


def _format_analysis_output(
    report: AggregatedMLTasksReport, insights: List[str], recommendations: List[str]
) -> str:
    lines: List[str] = []
    lines.append("═══════════════════════════════════════════════════════════")
    lines.append("ML TASK META-CRITIC ANALYSIS REPORT")
    lines.append("═══════════════════════════════════════════════════════════\n")

    lines.append("SUMMARY:")
    lines.append(f"  • Total Tasks Analyzed: {report.total_tasks_analyzed}")
    lines.append(f"  • Completed: {report.completed_tasks}")
    lines.append(f"  • In Progress: {report.in_progress_tasks}")
    lines.append(f"  • Failed: {report.failed_tasks}")
    lines.append(f"  • Completion Rate: {report.average_completion_rate:.1f}%\n")

    lines.append("KEY INSIGHTS:")
    for insight in insights:
        lines.append(f"  {insight}")
    lines.append("")

    if recommendations:
        lines.append("RECOMMENDATIONS:")
        for rec in recommendations:
            lines.append(f"  → {rec}")
        lines.append("")

    if report.tasks:
        lines.append("DETAILED TASK ANALYSIS:")
        for task in report.tasks[:5]:
            lines.append(f"\n  Task: {task.id} - {task.title}")
            lines.append(f"    Coverage: {task.coverage_dimensions or 0}/7 dimensions")
            lines.append(f"    Tests Passed: {'✓' if task.tests_passed else '✗'}")

            failed_checks = [
                name for name, passed in task.verification_checklist.items() if not passed
            ]
            if failed_checks:
                lines.append(f"    Failed Checks: {', '.join(failed_checks)}")

            if task.deliverables:
                lines.append(f"    Deliverables: {', '.join(task.deliverables[:2])}")
        lines.append("")

    lines.append("═══════════════════════════════════════════════════════════")
    return "\n".join(lines)


def _generate_insights(report: AggregatedMLTasksReport) -> List[str]:
    insights: List[str] = []
    insights.append(
        f"Task Completion: {report.average_completion_rate:.1f}% of {report.total_tasks_analyzed} tasks completed successfully"
    )
    if report.in_progress_tasks > 0:
        insights.append(f"In Progress: {report.in_progress_tasks} tasks currently being worked on")
    if report.failed_tasks > 0:
        insights.append(f"Issues: {report.failed_tasks} tasks encountered blockers")

    if report.blockers_detected:
        insights.append(f"Critical Blockers: {len(report.blockers_detected)} issues identified")
        for blocker in report.blockers_detected[:3]:
            insights.append(f"  - {blocker}")

    if report.patterns_observed:
        insights.append("Patterns Observed:")
        for pattern in report.patterns_observed:
            insights.append(f"  - {pattern}")

    high_quality = sum(1 for t in report.tasks if (t.coverage_dimensions or 0) >= 6)
    low_quality = sum(1 for t in report.tasks if (t.coverage_dimensions or 0) < 4)
    insights.append(
        f"Quality Distribution: {high_quality} high-quality, {low_quality} low-quality completions"
    )
    return insights


def _generate_recommendations(report: AggregatedMLTasksReport) -> List[str]:
    recommendations: List[str] = []
    if report.average_completion_rate < 70:
        recommendations.append(
            "URGENT: Investigate root causes of low completion rate. Consider process changes or resource allocation."
        )

    avg_dimensions = (
        sum(t.coverage_dimensions or 0 for t in report.tasks) / len(report.tasks)
        if report.tasks
        else 0.0
    )
    if avg_dimensions < 5:
        recommendations.append(
            f"Improve test coverage: Average is {avg_dimensions:.1f}/7 dimensions. Target: 6+"
        )

    tasks_without_artifacts = sum(1 for t in report.tasks if not t.artifacts_generated)
    if tasks_without_artifacts > 0:
        recommendations.append(
            f"Enforce artifact documentation: {tasks_without_artifacts} tasks lack documented artifacts"
        )

    if len(report.blockers_detected) > 3:
        recommendations.append(
            "Implement blocker prevention: Establish pre-flight checks and dependency validation before task start"
        )

    failed_verifications = sum(
        1
        for t in report.tasks
        if sum(1 for passed in t.verification_checklist.values() if passed) < 3
    )
    if failed_verifications > 0:
        recommendations.append(
            f"Strengthen quality gates: {failed_verifications} tasks failed verification checks"
        )

    if len(report.tasks) > 5 and report.average_completion_rate < 80:
        recommendations.append(
            "Consider team training on task completion methodology and quality standards"
        )
    return recommendations


def _should_escalate(report: AggregatedMLTasksReport) -> bool:
    if report.average_completion_rate < 60:
        return True
    if len(report.blockers_detected) > 5:
        return True
    if report.failed_tasks > max(report.completed_tasks // 2, 1):
        return True
    avg_dimensions = (
        sum(t.coverage_dimensions or 0 for t in report.tasks) / len(report.tasks)
        if report.tasks
        else 0.0
    )
    if avg_dimensions < 3:
        return True
    return False


def _analyze_completed_task(
    task_id: str, completion_path: Path
) -> Optional[MLTaskCompletionReport]:
    try:
        content = completion_path.read_text(encoding="utf-8")
    except OSError:
        return None

    try:
        extracted_at = int(completion_path.stat().st_mtime * 1000)
    except (OSError, ValueError):
        extracted_at = int(time.time() * 1000)

    return MLTaskCompletionReport(
        id=task_id,
        title=_extract_title(completion_path),
        completion_path=str(completion_path.relative_to(ROOT)),
        extracted_at=extracted_at,
        deliverables=_extract_deliverables(content),
        quality_metrics=_extract_quality_metrics(content),
        tests_passed=_extract_tests_passed(content),
        test_count=_extract_test_count(content),
        coverage_dimensions=_extract_coverage_dimensions(content),
        artifacts_generated=_extract_artifacts(content),
        verification_checklist=_extract_verification_checklist(content),
        critic_results=_extract_critic_results(content),
    )


def _generate_aggregated_report(task_filter: Optional[str] = None) -> AggregatedMLTasksReport:
    doc_tasks: List[MLTaskSummary] = []
    for report_path in _find_completion_reports(DOCS_DIR):
        task_id = _extract_task_id(report_path)
        summary = MLTaskSummary(
            id=task_id,
            title=_extract_title(report_path),
            status="done",
            completion_path=report_path,
        )
        doc_tasks.append(summary)

    state_tasks = _load_state_tasks()
    tasks = _merge_tasks(doc_tasks, state_tasks)

    if task_filter:
        lowered = task_filter.lower()
        tasks = [
            t
            for t in tasks
            if lowered in t.id.lower()
            or lowered in t.title.lower()
            or (t.completion_path and lowered in str(t.completion_path).lower())
        ]

    reports: List[MLTaskCompletionReport] = []
    completed = in_progress = failed = 0
    success_signals = 0

    for task in tasks:
        report = None
        if task.completion_path:
            report = _analyze_completed_task(task.id, task.completion_path)
        if report:
            reports.append(report)
            if report.tests_passed:
                success_signals += 1

        classification = _classify_task_status(task, report)
        if classification == "completed":
            completed += 1
            if not report:
                success_signals += 1
        elif classification == "in_progress":
            in_progress += 1
        else:
            failed += 1

    completion_rate = (success_signals / len(tasks) * 100) if tasks else 0.0

    return AggregatedMLTasksReport(
        total_tasks_analyzed=len(tasks),
        completed_tasks=completed,
        in_progress_tasks=in_progress,
        failed_tasks=failed,
        average_completion_rate=completion_rate,
        tasks=reports,
        analysis_timestamp=int(time.time() * 1000),
        blockers_detected=_detect_blockers(reports),
        patterns_observed=_observe_patterns(reports),
    )


# --------------------------------- CLI ------------------------------------- #


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run ML task meta-critic analysis.")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of formatted text.",
    )
    parser.add_argument(
        "--filter",
        type=str,
        default="",
        help="Filter tasks by ID, title, or path substring.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    try:
        report = _generate_aggregated_report(args.filter or None)
    except Exception as exc:  # pylint: disable=broad-except
        payload = {
            "error": f"Meta-critic analysis failed: {exc}",
            "success": False,
        }
        print(json.dumps(payload, indent=2))
        return 1

    insights = _generate_insights(report)
    recommendations = _generate_recommendations(report)
    output = _format_analysis_output(report, insights, recommendations)
    escalate = _should_escalate(report)

    if args.json:
        payload = {
            "success": not escalate,
            "escalate": escalate,
            "report": asdict(report),
            "insights": insights,
            "recommendations": recommendations,
            "formatted": output,
        }
        print(json.dumps(payload, indent=2))
    else:
        print(output)
        if escalate:
            print("\nCRITICAL: Meta-critic recommends escalation.")

    return 1 if escalate else 0


if __name__ == "__main__":
    sys.exit(main())
