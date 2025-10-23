#!/usr/bin/env python3
"""
Reality-checking critics for autopilot tasks.

CRITICAL: These critics MUST be called before marking any task complete.
They detect scope-reality gaps, missing dependencies, and conceptual errors.

Usage:
    python run_critics.py --task T2.2.1 --metadata roadmap_metadata.json
"""

import argparse
import json
import sys
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
import yaml

ROOT = Path(__file__).parent.parent.parent.parent


@dataclass
class CriticIssue:
    type: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    message: str
    recommendation: str
    file: Optional[str] = None
    line: Optional[int] = None


@dataclass
class CriticResult:
    critic_name: str
    status: str  # PASSED, WARNING, FAILED
    issues: List[CriticIssue]
    summary: str


@dataclass
class ComprehensiveCritique:
    task_id: str
    status: str  # OK, WARNING, BLOCK
    timestamp: str
    critics: List[CriticResult]
    critical_issues: List[CriticIssue]
    overall_recommendation: str


def _run_modeling_reality(task_id: str) -> Optional[CriticResult]:
    script = ROOT / "tools" / "wvo_mcp" / "scripts" / "run_modeling_reality_critic.py"
    if not script.exists():
        return None
    cmd = ["python", str(script), "--json"]
    if task_id:
        cmd.extend(["--task", task_id])
    completed = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    try:
        data = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError:
        return None
    findings = data.get("findings", [])
    if not findings:
        return None

    issues: List[CriticIssue] = []
    for finding in findings:
        severity = finding.get("severity", "WARNING")
        issues.append(
            CriticIssue(
                type="MODEL_REALITY",
                severity=severity,
                message=finding.get("message", "Modeling issue detected"),
                recommendation=finding.get("remediation", ""),
                file=finding.get("evidence"),
                line=None,
            )
        )

    status = "FAILED" if any(issue.severity == "CRITICAL" for issue in issues) else "WARNING"
    summary = f"Modeling reality critic found {len(issues)} issue(s)"
    return CriticResult(
        critic_name="ModelingRealityCritic",
        status=status,
        issues=issues,
        summary=summary,
    )


def _run_meta_critique(epic_id: Optional[str]) -> Optional[CriticResult]:
    if not epic_id:
        return None
    script = ROOT / "tools" / "wvo_mcp" / "scripts" / "run_meta_critique.py"
    if not script.exists():
        return None

    cmd = ["python", str(script), "--epic", epic_id, "--json"]
    completed = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    try:
        data = json.loads(completed.stdout or "{}")
    except json.JSONDecodeError:
        return None

    critical = data.get("critical_issues", [])
    high = data.get("high_issues", [])
    warnings = data.get("warnings", [])
    if not (critical or high or warnings):
        return None

    issues: List[CriticIssue] = []
    for entry in critical:
        issues.append(
            CriticIssue(
                type="META_CRITIQUE",
                severity="CRITICAL",
                message=entry.get("message", "Meta-critique critical issue"),
                recommendation=entry.get("recommendation", ""),
                file=data.get("doc_path"),
            )
        )
    for entry in high:
        issues.append(
            CriticIssue(
                type="META_CRITIQUE",
                severity="HIGH",
                message=entry.get("message", "Meta-critique high-priority issue"),
                recommendation=entry.get("recommendation", ""),
                file=data.get("doc_path"),
            )
        )
    for entry in warnings:
        issues.append(
            CriticIssue(
                type="META_CRITIQUE",
                severity="WARNING",
                message=entry.get("message", "Meta-critique warning"),
                recommendation=entry.get("recommendation", ""),
                file=data.get("doc_path"),
            )
        )

    status = "FAILED" if critical else "WARNING"
    summary = (
        f"Meta-critique report: {len(critical)} critical, {len(high)} high, {len(warnings)} warnings"
    )
    return CriticResult(
        critic_name="MetaCritiqueCritic",
        status=status,
        issues=issues,
        summary=summary,
    )


class RealityCheckCritic:
    """Detects when docs claim features that code doesn't implement."""

    def __init__(self, root: Path):
        self.root = root

    def analyze(self, task_id: str, metadata: Dict[str, Any], code_files: List[Path], docs: List[Path]) -> CriticResult:
        issues = []

        # Get claims from metadata
        claims = metadata.get("claims", [])

        for claim in claims:
            if not self._verify_claim(claim, code_files):
                issues.append(CriticIssue(
                    type="CLAIM_NOT_IMPLEMENTED",
                    severity="CRITICAL",
                    message=f"Docs claim '{claim}' but code doesn't implement it",
                    recommendation=f"Either implement '{claim}' or remove from docs"
                ))

        # Check for placeholder code
        placeholder_issues = self._check_placeholders(code_files)
        issues.extend(placeholder_issues)

        # Check for hardcoded values
        hardcode_issues = self._check_hardcoded_values(code_files)
        issues.extend(hardcode_issues)

        status = "FAILED" if any(i.severity == "CRITICAL" for i in issues) else \
                 "WARNING" if issues else "PASSED"

        return CriticResult(
            critic_name="RealityCheckCritic",
            status=status,
            issues=issues,
            summary=f"Found {len(issues)} reality gaps" if issues else "Code matches documentation"
        )

    def _verify_claim(self, claim: str, code_files: List[Path]) -> bool:
        """Check if claim is implemented in code."""
        # Pattern matching for common claims
        patterns = {
            "Robyn": r"import\s+robyn|from\s+robyn",
            "LightweightMMM": r"import\s+lightweight_mmm|from\s+lightweight_mmm",
            "adstock": r"adstock|carryover",
            "saturation": r"saturation|diminishing",
            "TimeSeriesSplit": r"TimeSeriesSplit|time.*series.*split",
            "hierarchical": r"hierarchical|partial.*pool|multilevel",
            "PyMC": r"import\s+pymc|from\s+pymc",
            "XGBoost": r"import\s+xgboost|XGBRegressor|XGBClassifier",
            "LightGBM": r"import\s+lightgbm|LGBMRegressor|LGBMClassifier",
            "LSTM": r"LSTM|nn\.LSTM",
            "Attention": r"Attention|MultiheadAttention",
            "constraint": r"constraint|cvxpy|scipy\.optimize",
        }

        # Find pattern for this claim
        for keyword, pattern in patterns.items():
            if keyword.lower() in claim.lower():
                # Search for pattern in code files
                for code_file in code_files:
                    if code_file.exists() and code_file.is_file():
                        content = code_file.read_text()
                        if re.search(pattern, content, re.IGNORECASE):
                            return True
                return False

        # If no pattern match, do simple string search
        claim_lower = claim.lower()
        for code_file in code_files:
            if code_file.exists() and code_file.is_file():
                content = code_file.read_text().lower()
                if claim_lower in content:
                    return True

        return False

    def _check_placeholders(self, code_files: List[Path]) -> List[CriticIssue]:
        """Find placeholder code (TODO, FIXME, placeholder comments)."""
        issues = []
        placeholder_patterns = [
            (r"#\s*TODO", "TODO comment found"),
            (r"#\s*FIXME", "FIXME comment found"),
            (r"#\s*PLACEHOLDER", "Placeholder comment found"),
            (r"raise\s+NotImplementedError", "NotImplementedError found"),
            (r"pass\s*#.*placeholder", "Placeholder pass statement"),
        ]

        for code_file in code_files:
            if not code_file.exists() or not code_file.is_file():
                continue

            lines = code_file.read_text().splitlines()
            for i, line in enumerate(lines, start=1):
                for pattern, description in placeholder_patterns:
                    if re.search(pattern, line, re.IGNORECASE):
                        issues.append(CriticIssue(
                            type="PLACEHOLDER_CODE",
                            severity="HIGH",
                            message=f"{description}: {line.strip()}",
                            recommendation="Implement actual logic or mark task incomplete",
                            file=str(code_file.relative_to(self.root)),
                            line=i
                        ))

        return issues

    def _check_hardcoded_values(self, code_files: List[Path]) -> List[CriticIssue]:
        """Find hardcoded magic numbers that should be learned."""
        issues = []

        # Patterns for suspicious hardcoded values
        suspicious_patterns = [
            (r"elasticity\s*=\s*0\.\d+", "Hardcoded elasticity (should be learned from data)"),
            (r"coefficient\s*=\s*\d+\.\d+", "Hardcoded coefficient (should be learned)"),
            (r"roas\s*=\s*\d+\.\d+", "Hardcoded ROAS (should be measured)"),
        ]

        for code_file in code_files:
            if not code_file.exists() or not code_file.is_file():
                continue

            lines = code_file.read_text().splitlines()
            for i, line in enumerate(lines, start=1):
                for pattern, description in suspicious_patterns:
                    if re.search(pattern, line, re.IGNORECASE):
                        issues.append(CriticIssue(
                            type="HARDCODED_VALUE",
                            severity="CRITICAL",
                            message=f"{description}: {line.strip()}",
                            recommendation="Replace hardcoded value with learned model parameter",
                            file=str(code_file.relative_to(self.root)),
                            line=i
                        ))

        return issues


class DependencyCritic:
    """Verifies all dependencies are satisfied."""

    def __init__(self, root: Path):
        self.root = root

    def analyze(self, task_id: str, metadata: Dict[str, Any]) -> CriticResult:
        issues = []

        # Check code imports
        code_imports = metadata.get("dependencies", {}).get("code_imports", [])
        for import_name in code_imports:
            if not self._check_import(import_name):
                issues.append(CriticIssue(
                    type="MISSING_DEPENDENCY",
                    severity="CRITICAL",
                    message=f"Required package '{import_name}' not installed",
                    recommendation=f"Install with: pip install {import_name}"
                ))

        # Check data requirements
        data_reqs = metadata.get("dependencies", {}).get("data_requirements", [])
        for req in data_reqs:
            data_issues = self._check_data_requirement(req)
            issues.extend(data_issues)

        # Check upstream tasks
        upstream = metadata.get("dependencies", {}).get("upstream_tasks", [])
        for task in upstream:
            if not self._check_task_complete(task):
                issues.append(CriticIssue(
                    type="UPSTREAM_INCOMPLETE",
                    severity="CRITICAL",
                    message=f"Upstream task '{task}' not complete",
                    recommendation=f"Complete task {task} before proceeding"
                ))

        status = "FAILED" if any(i.severity == "CRITICAL" for i in issues) else \
                 "WARNING" if issues else "PASSED"

        return CriticResult(
            critic_name="DependencyCritic",
            status=status,
            issues=issues,
            summary=f"Found {len(issues)} missing dependencies" if issues else "All dependencies satisfied"
        )

    def _check_import(self, import_name: str) -> bool:
        """Check if Python package can be imported."""
        try:
            result = subprocess.run(
                [sys.executable, "-c", f"import {import_name}"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

    def _check_data_requirement(self, req: Dict[str, Any]) -> List[CriticIssue]:
        """Check if data file meets requirements."""
        issues = []
        name = req.get("name", "unknown")
        min_rows = req.get("min_rows", 0)

        # Find data file
        data_file = self.root / "data" / f"{name}.csv"
        if not data_file.exists():
            issues.append(CriticIssue(
                type="MISSING_DATA",
                severity="CRITICAL",
                message=f"Required data file '{name}.csv' not found",
                recommendation=f"Run data ingestion pipeline to generate {name}.csv"
            ))
            return issues

        # Check row count
        try:
            import pandas as pd
            df = pd.read_csv(data_file)
            if len(df) < min_rows:
                issues.append(CriticIssue(
                    type="INSUFFICIENT_DATA",
                    severity="CRITICAL",
                    message=f"Data file '{name}.csv' has {len(df)} rows, need {min_rows}+",
                    recommendation=f"Collect more data or reduce min_rows requirement"
                ))
        except Exception as e:
            issues.append(CriticIssue(
                type="DATA_ERROR",
                severity="HIGH",
                message=f"Error reading data file '{name}.csv': {e}",
                recommendation="Fix data file corruption"
            ))

        return issues

    def _check_task_complete(self, task_id: str) -> bool:
        """Check if upstream task is complete in roadmap."""
        roadmap_file = self.root / "state" / "roadmap.yaml"
        if not roadmap_file.exists():
            return False

        try:
            roadmap = yaml.safe_load(roadmap_file.read_text())
            # Search for task in roadmap
            for epic in roadmap.get("epics", []):
                for milestone in epic.get("milestones", []):
                    for task in milestone.get("tasks", []):
                        if task.get("id") == task_id:
                            return task.get("status") == "completed"
            return False
        except Exception:
            return False


class ConceptualCorrectnessCritic:
    """Detects methodology errors (wrong algorithm for problem)."""

    def __init__(self, root: Path):
        self.root = root

    def analyze(self, task_id: str, metadata: Dict[str, Any], code_files: List[Path]) -> CriticResult:
        issues = []

        problem_type = metadata.get("problem_type")
        wrong_methods = metadata.get("wrong_methods", [])

        # Check if wrong methods are used
        for wrong_method in wrong_methods:
            for code_file in code_files:
                if not (code_file.exists() and code_file.is_file()):
                    continue
                if code_file.suffix.lower() not in {".py"}:
                    continue
                content = code_file.read_text()
                if wrong_method in content:
                    issues.append(CriticIssue(
                        type="WRONG_METHOD",
                        severity="CRITICAL",
                        message=f"Using {wrong_method} for {problem_type} problem (incorrect method)",
                        recommendation=f"Use correct methods: {', '.join(metadata.get('correct_methods', []))}",
                        file=str(code_file.relative_to(self.root))
                    ))

        # Check for common methodological errors
        method_errors = self._check_common_errors(problem_type, code_files)
        issues.extend(method_errors)

        status = "FAILED" if any(i.severity == "CRITICAL" for i in issues) else \
                 "WARNING" if issues else "PASSED"

        return CriticResult(
            critic_name="ConceptualCorrectnessCritic",
            status=status,
            issues=issues,
            summary=f"Found {len(issues)} methodological errors" if issues else "Methodology appears sound"
        )

    def _check_common_errors(self, problem_type: str, code_files: List[Path]) -> List[CriticIssue]:
        """Check for common methodological mistakes."""
        issues = []

        for code_file in code_files:
            if not code_file.exists() or not code_file.is_file():
                continue

            suffix = code_file.suffix.lower()
            content = code_file.read_text()

            # MMM without adstock
            if problem_type == "media_mix_modeling":
                if suffix not in {".py"}:
                    continue
                if "adstock" not in content.lower() and "carryover" not in content.lower():
                    issues.append(CriticIssue(
                        type="MISSING_TRANSFORMATION",
                        severity="CRITICAL",
                        message="MMM missing adstock transformation (ad effects carry over time)",
                        recommendation="Add adstock: adstocked[t] = spend[t] + decay * adstocked[t-1]",
                        file=str(code_file.relative_to(self.root))
                    ))

            # Time series with wrong split
            if "time_series" in problem_type.lower() or problem_type == "forecasting":
                if suffix not in {".py"}:
                    continue
                if "train_test_split" in content and "TimeSeriesSplit" not in content:
                    issues.append(CriticIssue(
                        type="WRONG_SPLIT",
                        severity="CRITICAL",
                        message="Using random train_test_split for time series (leaks future data)",
                        recommendation="Use TimeSeriesSplit to preserve temporal order",
                        file=str(code_file.relative_to(self.root))
                    ))

            # Causal inference errors
            if "causal" in problem_type.lower():
                if suffix not in {".py"}:
                    continue
                if "propensity" in content.lower() and "weather" in content.lower():
                    issues.append(CriticIssue(
                        type="WRONG_CAUSAL_METHOD",
                        severity="CRITICAL",
                        message="Using propensity scoring for weather (cannot randomize weather)",
                        recommendation="Use DID, synthetic control, or regression discontinuity instead",
                        file=str(code_file.relative_to(self.root))
                    ))

        return issues


def main():
    parser = argparse.ArgumentParser(description="Run reality-checking critics on task")
    parser.add_argument("--task", required=True, help="Task ID (e.g., T2.2.1)")
    parser.add_argument("--metadata-file", help="Path to task metadata JSON/YAML")
    parser.add_argument("--metadata", help="Task metadata as JSON string")
    parser.add_argument("--code-glob", help="Glob pattern for code files (e.g., 'apps/model/*.py')")
    parser.add_argument("--docs-glob", help="Glob pattern for docs (e.g., 'docs/*.md')")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    # Load metadata and locate task in roadmap
    roadmap = None
    task_epic_id: Optional[str] = None
    if args.metadata_file:
        with open(args.metadata_file) as f:
            if args.metadata_file.endswith(".yaml") or args.metadata_file.endswith(".yml"):
                metadata = yaml.safe_load(f)
            else:
                metadata = json.load(f)
        roadmap_path = ROOT / "state" / "roadmap.yaml"
        if roadmap_path.exists():
            roadmap = yaml.safe_load(roadmap_path.read_text())
            _, task_epic_id = find_task_details(roadmap, args.task)
    elif args.metadata:
        metadata = json.loads(args.metadata)
        roadmap_path = ROOT / "state" / "roadmap.yaml"
        if roadmap_path.exists():
            roadmap = yaml.safe_load(roadmap_path.read_text())
            _, task_epic_id = find_task_details(roadmap, args.task)
    else:
        roadmap_path = ROOT / "state" / "roadmap.yaml"
        if roadmap_path.exists():
            roadmap = yaml.safe_load(roadmap_path.read_text())
            metadata, task_epic_id = find_task_details(roadmap, args.task)
        else:
            metadata = {}

    metadata = metadata or {}

    # Collect code files
    if args.code_glob:
        from glob import glob
        code_files = [Path(f) for f in glob(args.code_glob, recursive=True)]
    else:
        # Default: scan common code directories
        code_files = list(ROOT.glob("apps/**/*.py")) + list(ROOT.glob("apps/**/*.ts"))

    # Collect docs
    if args.docs_glob:
        from glob import glob
        docs = [Path(f) for f in glob(args.docs_glob, recursive=True)]
    else:
        docs = list(ROOT.glob("docs/**/*.md"))

    # Run critics
    critics = [
        RealityCheckCritic(ROOT),
        DependencyCritic(ROOT),
        ConceptualCorrectnessCritic(ROOT),
    ]

    results = []
    for critic in critics:
        if isinstance(critic, RealityCheckCritic):
            result = critic.analyze(args.task, metadata, code_files, docs)
        elif isinstance(critic, ConceptualCorrectnessCritic):
            result = critic.analyze(args.task, metadata, code_files)
        else:
            result = critic.analyze(args.task, metadata)
        results.append(result)

    modeling_result = _run_modeling_reality(args.task)
    if modeling_result:
        results.append(modeling_result)

    meta_result = _run_meta_critique(task_epic_id)
    if meta_result:
        results.append(meta_result)

    # Aggregate
    critical_issues: List[CriticIssue] = []
    for result in results:
        critical_issues.extend([i for i in result.issues if i.severity == "CRITICAL"])

    status = "BLOCK" if critical_issues else \
             "WARNING" if any(r.status == "WARNING" for r in results) else "OK"

    if critical_issues:
        recommendation = "BLOCK task until critical issues resolved"
    elif any(r.status == "WARNING" for r in results):
        recommendation = "Address warnings before marking complete"
    else:
        recommendation = "Task appears sound, safe to proceed"

    critique = ComprehensiveCritique(
        task_id=args.task,
        status=status,
        timestamp="",  # Add timestamp if needed
        critics=results,
        critical_issues=critical_issues,
        overall_recommendation=recommendation
    )

    # Output
    if args.json:
        print(json.dumps(asdict(critique), indent=2))
    else:
        print(f"\n{'='*60}")
        print(f"Critique for Task {args.task}")
        print(f"{'='*60}\n")
        print(f"Overall Status: {status}")
        print(f"Recommendation: {recommendation}\n")

        for result in results:
            print(f"\n{result.critic_name}: {result.status}")
            print(f"  {result.summary}")
            if result.issues:
                for issue in result.issues:
                    print(f"\n  [{issue.severity}] {issue.type}")
                    print(f"    Message: {issue.message}")
                    print(f"    Recommendation: {issue.recommendation}")
                    if issue.file:
                        print(f"    File: {issue.file}:{issue.line or ''}")

        if critical_issues:
            print(f"\n{'!'*60}")
            print(f"❌ CRITICAL ISSUES FOUND: {len(critical_issues)}")
            print(f"{'!'*60}\n")
            sys.exit(1)
        elif status == "WARNING":
            print(f"\n{'⚠'*60}")
            print(f"⚠ Warnings found, review before proceeding")
            print(f"{'⚠'*60}\n")
            sys.exit(0)
        else:
            print(f"\n✅ All critics passed\n")
            sys.exit(0)


def find_task_details(roadmap: Dict, task_id: str) -> Tuple[Dict, Optional[str]]:
    """Return task metadata and epic id for a given task."""
    for epic in roadmap.get("epics", []):
        epic_id = epic.get("id")
        for milestone in epic.get("milestones", []):
            for task in milestone.get("tasks", []):
                if task.get("id") == task_id:
                    return task.get("metadata", {}) or {}, epic_id
    return {}, None


def find_task_metadata(roadmap: Dict, task_id: str) -> Dict:
    metadata, _ = find_task_details(roadmap, task_id)
    return metadata


if __name__ == "__main__":
    main()
