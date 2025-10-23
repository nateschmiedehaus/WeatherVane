#!/usr/bin/env python3
"""
Modeling Reality Critic
-----------------------

This critic compares documented modeling intentions against the current codebase.
It reports objective, corrective findings instead of generic complaints so
Autopilot can act on concrete gaps.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional


@dataclass
class Finding:
    """Structured observation from the critic."""

    severity: str  # e.g. 'CRITICAL', 'WARNING', 'INFO'
    message: str
    evidence: str
    remediation: str
    roadmap_ref: str | None = None


@dataclass
class CriticContext:
    pipeline_uses_lightweight: bool
    heuristic_mmm_invoked: bool
    mmm_lightweight_exists: bool
    heuristic_has_adstock: bool
    mmm_module_uses_lightweight: bool
    weather_shock_module_exists: bool
    weather_service_uses_shock: bool
    weather_shock_tests_exist: bool
    geography_mapper_exists: bool


def locate_repo_root(start: Path) -> Path:
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return start


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def filter_findings(findings: List[Finding], task: Optional[str]) -> List[Finding]:
    if not task:
        return findings
    task_upper = task.upper()
    filtered: List[Finding] = []
    for finding in findings:
        if finding.roadmap_ref:
            ref = finding.roadmap_ref.upper()
            if ref.startswith(task_upper) or task_upper.startswith(ref):
                filtered.append(finding)
                continue
            if task_upper in ref:
                filtered.append(finding)
                continue
        else:
            filtered.append(finding)
    return filtered


def findings_to_json(findings: List[Finding]) -> str:
    payload = {
        "findings": [
            {
                "severity": f.severity,
                "message": f.message,
                "evidence": f.evidence,
                "remediation": f.remediation,
                "roadmap_ref": f.roadmap_ref,
            }
            for f in findings
        ],
        "critical_count": sum(1 for f in findings if f.severity == "CRITICAL"),
        "warning_count": sum(1 for f in findings if f.severity == "WARNING"),
    }
    return json.dumps(payload, indent=2)

def collect_context(root: Path) -> CriticContext:
    poc_models = root / "apps" / "model" / "pipelines" / "poc_models.py"
    poc_text = read_text(poc_models)
    pipeline_calls_lightweight = "fit_lightweight_mmm" in poc_text
    heuristic_mmm_invoked = "fit_mmm_model(" in poc_text

    mmm_lightweight_path = root / "apps" / "model" / "mmm_lightweight.py"
    mmm_module_path = root / "apps" / "model" / "mmm.py"
    mmm_module_text = read_text(mmm_module_path)
    heuristic_has_adstock = (
        "adstock" in mmm_module_text or "saturation" in mmm_module_text or "hill" in mmm_module_text.lower()
    )
    mmm_module_uses_lightweight = "fit_lightweight_mmm" in mmm_module_text

    pipeline_uses_lightweight = pipeline_calls_lightweight or (heuristic_mmm_invoked and mmm_module_uses_lightweight)

    weather_shock_module_path = root / "shared" / "libs" / "causal" / "weather_shock.py"
    weather_service_path = root / "apps" / "api" / "services" / "weather_service.py"
    weather_service_text = read_text(weather_service_path)
    weather_shock_tests_path = root / "tests" / "shared" / "libs" / "causal" / "test_weather_shock.py"

    geography_mapper_path = root / "shared" / "libs" / "geography" / "mapper.py"

    return CriticContext(
        pipeline_uses_lightweight=pipeline_uses_lightweight,
        heuristic_mmm_invoked=heuristic_mmm_invoked,
        mmm_lightweight_exists=mmm_lightweight_path.exists(),
        heuristic_has_adstock=heuristic_has_adstock,
        mmm_module_uses_lightweight=mmm_module_uses_lightweight,
        weather_shock_module_exists=weather_shock_module_path.exists(),
        weather_service_uses_shock="estimate_weather_shock_effect" in weather_service_text,
        weather_shock_tests_exist=weather_shock_tests_path.exists(),
        geography_mapper_exists=geography_mapper_path.exists(),
    )


def check_mmm_lightweight(root: Path, ctx: CriticContext) -> Iterable[Finding]:
    poc_models = root / "apps" / "model" / "pipelines" / "poc_models.py"
    mmm_module = root / "apps" / "model" / "mmm.py"

    if ctx.mmm_lightweight_exists and ctx.pipeline_uses_lightweight:
        return

    if not ctx.mmm_lightweight_exists:
        yield Finding(
            severity="WARNING",
            message="LightweightMMM scaffold missing; pipeline cannot elevate beyond heuristic MMM.",
            evidence=f"{root / 'apps' / 'model' / 'mmm_lightweight.py'} not found.",
            remediation="Add LightweightMMM integration module and call it from the modeling pipeline before rollout.",
            roadmap_ref="T13.2.1",
        )
        return

    if not ctx.mmm_module_uses_lightweight:
        yield Finding(
            severity="CRITICAL",
            message="MMM module never routes through LightweightMMM.",
            evidence=f"{mmm_module} does not reference fit_lightweight_mmm().",
            remediation="Route fit_mmm_model through mmm_lightweight.fit_lightweight_mmm before falling back to the heuristic implementation.",
            roadmap_ref="T13.2.1",
        )
        return

    if not ctx.heuristic_mmm_invoked:
        yield Finding(
            severity="CRITICAL",
            message="Modeling pipeline never invokes fit_mmm_model(), so LightweightMMM path is unreachable.",
            evidence=f"{poc_models} lacks a call to fit_mmm_model().",
            remediation="Ensure train_poc_models wires MMM fitting so LightweightMMM results propagate to guardrails and allocations.",
            roadmap_ref="T13.2.1",
        )


def check_mmm_adstock(root: Path, ctx: CriticContext) -> Iterable[Finding]:
    mmm_module = root / "apps" / "model" / "mmm.py"
    if ctx.heuristic_has_adstock:
        return

    if ctx.pipeline_uses_lightweight:
        yield Finding(
            severity="INFO",
            message="Heuristic MMM fallback lacks adstock/saturation (acceptable once LightweightMMM is primary).",
            evidence=f"{mmm_module} still returns covariance-based elasticities as fallback.",
            remediation="Document the fallback limitations or upgrade fallback path with simplified adstock to avoid regressions when LightweightMMM is unavailable.",
            roadmap_ref="T13.2.1",
        )
    elif ctx.heuristic_mmm_invoked:
        yield Finding(
            severity="CRITICAL",
            message="MMM implementation lacks adstock or saturation transforms.",
            evidence=f"{mmm_module} has no mention of adstock or saturation functions.",
            remediation="Adopt geometric adstock and Hill saturation before exposing channel elasticities.",
            roadmap_ref="T13.2.1",
        )


def check_causal_method(root: Path, ctx: CriticContext) -> Iterable[Finding]:
    weather_module = root / "shared" / "libs" / "causal" / "weather_shock.py"
    weather_service = root / "apps" / "api" / "services" / "weather_service.py"
    tests_path = root / "tests" / "shared" / "libs" / "causal" / "test_weather_shock.py"

    if not ctx.weather_shock_module_exists:
        yield Finding(
            severity="CRITICAL",
            message="Difference-in-differences weather shock estimator missing.",
            evidence=f"{weather_module} does not exist.",
            remediation="Implement shared.libs.causal.weather_shock with DID/synthetic control support before advertising the upgraded methodology.",
            roadmap_ref="T13.3.1",
        )
        return

    if not ctx.weather_service_uses_shock:
        yield Finding(
            severity="CRITICAL",
            message="Weather API still bypasses the DID estimator.",
            evidence=f"{weather_service} does not import estimate_weather_shock_effect.",
            remediation="Route /v1/weather/shock-analysis through shared.libs.causal.weather_shock.estimate_weather_shock_effect so docs and API align.",
            roadmap_ref="T13.3.1",
        )

    if ctx.weather_service_uses_shock and not ctx.weather_shock_tests_exist:
        yield Finding(
            severity="WARNING",
            message="Weather shock estimator lacks regression coverage.",
            evidence=f"{tests_path} not found.",
            remediation="Add targeted tests exercising estimate_weather_shock_effect and the API surface to prevent regressions.",
            roadmap_ref="T13.3.1",
        )


def find_line_number(path: Path, pattern: str) -> int:
    try:
        for idx, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if re.search(pattern, line):
                return idx
    except FileNotFoundError:
        pass
    return -1


def check_backtesting_suite(root: Path, _ctx: CriticContext) -> Iterable[Finding]:
    candidate = root / "tests" / "modeling" / "test_mmm_backtests.py"
    if not candidate.exists():
        yield Finding(
            severity="CRITICAL",
            message="No MMM backtesting suite found.",
            evidence="Expected tests/modeling/test_mmm_backtests.py does not exist.",
            remediation="Add a rolling backtest harness to exercise MMM across historical windows and guard regressions.",
            roadmap_ref="T13.2.2",
        )


def check_geo_hierarchy(root: Path, ctx: CriticContext) -> Iterable[Finding]:
    mapper = root / "shared" / "libs" / "geography" / "mapper.py"
    crosswalk = root / "shared" / "data" / "geography" / "dma_county_crosswalk.csv"
    doc = root / "docs" / "MODELING_REALITY_CHECK.md"
    doc_text = read_text(doc)
    unresolved_prompt = "Need to answer these questions"

    if not ctx.geography_mapper_exists:
        yield Finding(
            severity="WARNING",
            message="No DMA-first geography mapper detected in shared libs.",
            evidence=f"{mapper} missing or empty.",
            remediation="Introduce shared.libs.geography.GeographyMapper so feature builders and allocators can resolve DMA/state fallbacks.",
            roadmap_ref="T13.3.2",
        )
    if not crosswalk.exists():
        yield Finding(
            severity="WARNING",
            message="DMA crosswalk dataset missing.",
            evidence=f"{crosswalk} does not exist.",
            remediation="Check shared/data/geography for dma_county_crosswalk.csv so geography mapper can resolve DMA codes.",
            roadmap_ref="T13.3.2",
        )
    if unresolved_prompt in doc_text:
        yield Finding(
            severity="WARNING",
            message="docs/MODELING_REALITY_CHECK.md still states geographic decisions are unresolved.",
            evidence="Document contains the prompt 'Need to answer these questions'.",
            remediation="Update the doc once DMA hierarchy is implemented to record the final decision and thresholds.",
            roadmap_ref="T13.3.2",
        )
    elif "DMA-first" not in doc_text:
        yield Finding(
            severity="INFO",
            message="Modeling reality doc omits the DMA-first decision.",
            evidence="Expected to find 'DMA-first' in docs/MODELING_REALITY_CHECK.md but it was absent.",
            remediation="Document the DMA-first geography pipeline so cross-functional teams can follow the implemented thresholds.",
            roadmap_ref="T13.3.2",
        )


def check_meta_critic_presence(root: Path, _ctx: CriticContext) -> Iterable[Finding]:
    roadmap = root / "state" / "roadmap.yaml"
    text = read_text(roadmap)
    if "modeling_reality" not in text:
        yield Finding(
            severity="WARNING",
            message="Roadmap lacks explicit Autopilot tasking for modeling reality checks.",
            evidence=f"{roadmap} has no modeling_reality critic entry.",
            remediation="Ensure roadmap includes Autopilot ownership for ongoing modeling vs execution reviews.",
            roadmap_ref="T13.4.1",
        )


def check_autopilot_integration(root: Path, _ctx: CriticContext) -> Iterable[Finding]:
    session = root / "tools" / "wvo_mcp" / "src" / "session.ts"
    text = read_text(session)
    critic_key_present = "modeling_reality" in text
    class_present = "ModelingRealityCritic" in text
    if not critic_key_present or not class_present:
        yield Finding(
            severity="CRITICAL",
            message="Modeling reality critic is not wired into Autopilot runtime.",
            evidence=f"{session} does not reference ModelingRealityCritic / modeling_reality key.",
            remediation="Register ModelingRealityCritic in the CRITIC_REGISTRY so Autopilot can schedule this analysis automatically.",
            roadmap_ref="T13.4.1",
        )


def summarize(findings: List[Finding]) -> int:
    critical = [f for f in findings if f.severity == "CRITICAL"]
    warnings = [f for f in findings if f.severity == "WARNING"]
    infos = [f for f in findings if f.severity not in {"CRITICAL", "WARNING"}]

    print("❌ Modeling reality critic found gaps between plans and code:")
    for group, label in ((critical, "CRITICAL"), (warnings, "WARNING"), (infos, "INFO")):
        if not group:
            continue
        print(f"\n{label} findings ({len(group)}):")
        for item in group:
            print(f"- {item.message}")
            print(f"  Evidence: {item.evidence}")
            print(f"  Remediation: {item.remediation}")
            if item.roadmap_ref:
                print(f"  Roadmap: {item.roadmap_ref}")

    return 1 if critical else 0


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Modeling reality critic runner.")
    parser.add_argument("--workspace", help="Override workspace root.")
    parser.add_argument("--task", help="Optional roadmap task ID to filter findings.")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text.")
    args = parser.parse_args(argv)

    start = Path(args.workspace).resolve() if args.workspace else Path(__file__).resolve().parent
    repo_root = locate_repo_root(start)
    context = collect_context(repo_root)

    all_findings: List[Finding] = []
    check_functions = (
        check_mmm_lightweight,
        check_mmm_adstock,
        check_causal_method,
        check_backtesting_suite,
        check_geo_hierarchy,
        check_meta_critic_presence,
        check_autopilot_integration,
    )

    for func in check_functions:
        all_findings.extend(func(repo_root, context))

    filtered = filter_findings(all_findings, args.task)

    if args.json:
        print(findings_to_json(filtered))
        return 1 if any(f.severity == "CRITICAL" for f in filtered) else 0

    if not filtered:
        print("✅ Modeling reality critic: implementation matches documented expectations.")
        return 0

    return summarize(filtered)


if __name__ == "__main__":
    sys.exit(main())
