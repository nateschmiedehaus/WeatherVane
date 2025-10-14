from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Iterable

import polars as pl

from apps.allocator.saturation_fairness import generate_saturation_report
from apps.worker.flows.creative_response_pipeline import (
    orchestrate_creative_response_flow,
)
from apps.worker.flows.poc_pipeline import orchestrate_poc_flow
from apps.worker.flows.rl_shadow_pipeline import run_shadow_simulation
from apps.worker.scheduling import AdaptiveWorkerScheduler, WorkloadClass
from apps.model.feedback import run_performance_check
from apps.worker.maintenance.retention import load_retention_summary, run_retention_sweep
from apps.worker.maintenance.reporting import (
    export_geocoding_reports,
    export_retention_report,
    load_geocoding_reports,
    load_retention_report as load_retention_report_full,
)
from apps.worker.validation.harness import run_smoke_test_sync
from apps.worker.validation.incrementality import record_experiment_observations


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WeatherVane worker entrypoint")
    parser.add_argument("tenant", nargs="?", default="demo-tenant", help="Tenant identifier (or 'ALL')")
    parser.add_argument("--start", dest="start", help="ISO8601 start date (optional)")
    parser.add_argument("--end", dest="end", help="ISO8601 end date (optional)")
    parser.add_argument(
        "--retention-only",
        action="store_true",
        help="Skip the pipeline and run the retention sweep",
    )
    parser.add_argument(
        "--retention-after",
        action="store_true",
        help="Run a retention sweep after the pipeline completes",
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=365,
        help="Retention window in days (default: 365)",
    )
    parser.add_argument(
        "--lake-root",
        default="storage/lake/raw",
        help="Lake root directory for retention sweeps",
    )
    parser.add_argument(
        "--retention-webhook-url",
        dest="retention_webhook_url",
        help="Webhook URL to notify when retention removes files",
    )
    parser.add_argument(
        "--all-tenants",
        action="store_true",
        help="Run retention against all tenants discovered in the lake",
    )
    parser.add_argument(
        "--retention-summary-root",
        dest="retention_summary_root",
        help="Directory to persist retention sweep summaries (JSON)",
    )
    parser.add_argument(
        "--context-root",
        dest="context_root",
        help="Directory containing context snapshots for tag telemetry",
    )
    parser.add_argument(
        "--retention-report",
        action="store_true",
        help="Print the latest retention summary and exit",
    )
    parser.add_argument(
        "--retention-report-day",
        dest="retention_report_day",
        help="Optional YYYY-MM-DD to fetch a specific retention summary",
    )
    parser.add_argument(
        "--smoke-test",
        action="store_true",
        help="Run the PoC smoke test and print a summary",
    )
    parser.add_argument(
        "--export-observability",
        dest="export_observability",
        help="Write retention/geocoding summaries to the provided JSON file",
    )
    parser.add_argument(
        "--log-file",
        dest="log_file",
        help="Append structured observability events (NDJSON)",
    )
    parser.add_argument(
        "--rl-shadow",
        action="store_true",
        help="Run reinforcement-learning shadow mode simulation and exit",
    )
    parser.add_argument(
        "--rl-episodes",
        type=int,
        default=30,
        help="Episode count for RL shadow simulation (default: 30)",
    )
    parser.add_argument(
        "--rl-epsilon",
        type=float,
        default=0.25,
        help="Exploration rate epsilon for RL shadow simulation (default: 0.25)",
    )
    parser.add_argument(
        "--rl-noise",
        type=float,
        default=0.06,
        help="Reward noise (Gaussian sigma) for RL shadow simulation",
    )
    parser.add_argument(
        "--rl-seed",
        type=int,
        default=17,
        help="Random seed for RL shadow simulation",
    )
    parser.add_argument(
        "--rl-max-guardrail-breaches",
        dest="rl_max_guardrail_breaches",
        type=int,
        default=2,
        help="Number of guardrail breaches before disabling a variant (default: 2)",
    )
    parser.add_argument(
        "--rl-min-baseline-fraction",
        dest="rl_min_baseline_fraction",
        type=float,
        default=0.2,
        help="Minimum fraction of episodes reserved for the baseline policy (default: 0.2)",
    )
    parser.add_argument(
        "--rl-max-variant-fraction",
        dest="rl_max_variant_fraction",
        type=float,
        default=0.5,
        help="Maximum fraction of episodes assigned to any single exploratory variant (default: 0.5)",
    )
    parser.add_argument(
        "--rl-output",
        dest="rl_output",
        help="Destination path for RL shadow report JSON (defaults to experiments/rl/shadow_mode.json)",
    )
    parser.add_argument(
        "--creative-report",
        action="store_true",
        help="Generate creative response report with brand safety guardrails and exit",
    )
    parser.add_argument(
        "--creative-dataset",
        dest="creative_dataset",
        help="Optional dataset path (CSV/JSON/Parquet) for creative response scoring",
    )
    parser.add_argument(
        "--creative-output",
        dest="creative_output",
        help="Destination path for creative response JSON (defaults to experiments/creative/response_scores.json)",
    )
    parser.add_argument(
        "--saturation-report",
        action="store_true",
        help="Generate cross-market saturation optimisation report and exit",
    )
    parser.add_argument(
        "--saturation-output",
        dest="saturation_output",
        help="Destination path for saturation report JSON (defaults to experiments/allocator/saturation_report.json)",
    )
    parser.add_argument(
        "--fairness-floor",
        dest="fairness_floor",
        type=float,
        default=0.8,
        help="Minimum share multiplier applied to each market's fairness weight (default: 0.8)",
    )
    parser.add_argument(
        "--saturation-roas-floor",
        dest="saturation_roas_floor",
        type=float,
        default=1.15,
        help="ROAS floor constraint for saturation optimisation (default: 1.15)",
    )
    parser.add_argument(
        "--saturation-budget",
        dest="saturation_budget",
        type=float,
        help="Override the total budget used for saturation optimisation",
    )
    parser.add_argument(
        "--check-performance",
        action="store_true",
        help="Summarise prediction accuracy and quantile coverage for stored outcomes",
    )
    parser.add_argument(
        "--performance-root",
        dest="performance_root",
        default="storage/metadata/performance",
        help="Directory containing stored performance records",
    )
    parser.add_argument(
        "--alert-forecast",
        action="store_true",
        help="Run forecast coverage alert, emitting warning when horizons fall below threshold",
    )
    parser.add_argument(
        "--alert-threshold",
        type=float,
        default=0.8,
        help="Coverage threshold used for alerts (default: 0.8)",
    )
    parser.add_argument(
        "--experiment-observations",
        dest="experiment_observations",
        help="Path to JSON or Parquet file containing geo holdout outcomes",
    )
    parser.add_argument(
        "--experiment-format",
        dest="experiment_format",
        choices=["json", "parquet"],
        help="Format for experiment observations (inferred from extension when omitted)",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _append_log(log_file: str | None, event: str, payload: dict[str, object]) -> None:
    if not log_file:
        return
    entry = {
        "event": event,
        "timestamp": datetime.utcnow().isoformat(),
        "payload": payload,
    }
    path = Path(log_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fh:
        fh.write(json.dumps(entry, sort_keys=True) + "\n")


def _run_retention(args: argparse.Namespace) -> dict[str, object]:
    tenant_id = None if args.all_tenants or args.tenant.upper() == "ALL" else args.tenant
    return run_retention_sweep(
        tenant_id=tenant_id,
        retention_days=args.retention_days,
        lake_root=args.lake_root,
        webhook_url=args.retention_webhook_url,
        summary_root=args.retention_summary_root,
        context_root=args.context_root,
    )


async def _run_pipeline(args: argparse.Namespace) -> dict[str, object]:
    return await orchestrate_poc_flow(
        tenant_id=args.tenant,
        start_date=_parse_datetime(args.start),
        end_date=_parse_datetime(args.end),
    )


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    scheduler = AdaptiveWorkerScheduler.from_environment()

    if args.check_performance:
        with scheduler.reserve(WorkloadClass.STANDARD):
            summary = run_performance_check(
                args.tenant,
                root=args.performance_root,
                coverage_threshold=args.alert_threshold,
            )
        print(json.dumps(summary, indent=2, sort_keys=True))
        _append_log(args.log_file, "performance.check", summary)
        return

    if args.rl_shadow:
        with scheduler.reserve(WorkloadClass.HEAVY):
            payload = run_shadow_simulation(
                episodes=args.rl_episodes,
                epsilon=args.rl_epsilon,
                reward_noise=args.rl_noise,
                seed=args.rl_seed,
                max_guardrail_breaches=args.rl_max_guardrail_breaches,
                min_baseline_fraction=args.rl_min_baseline_fraction,
                max_variant_fraction=args.rl_max_variant_fraction,
                output_path=args.rl_output,
            )
        print(json.dumps(payload, indent=2, sort_keys=True))
        _append_log(args.log_file, "allocator.rl_shadow", payload)
        return

    if args.creative_report:
        with scheduler.reserve(WorkloadClass.HEAVY):
            report = orchestrate_creative_response_flow.fn(
                dataset_path=args.creative_dataset,
                output_path=args.creative_output,
            )
        print(json.dumps(report, indent=2, sort_keys=True))
        _append_log(args.log_file, "creative.response", report)
        return

    if args.saturation_report:
        with scheduler.reserve(WorkloadClass.HEAVY):
            report = generate_saturation_report(
                total_budget=args.saturation_budget,
                fairness_floor=args.fairness_floor,
                roas_floor=args.saturation_roas_floor,
                output_path=args.saturation_output,
            )
        print(json.dumps(report, indent=2, sort_keys=True))
        _append_log(args.log_file, "allocator.saturation", report)
        return

    if args.experiment_observations:
        observations_path = Path(args.experiment_observations)
        if not observations_path.exists():
            raise SystemExit(f"Observations file not found: {observations_path}")

        fmt = args.experiment_format
        if fmt is None:
            suffix = observations_path.suffix.lower()
            if suffix in {".json", ".ndjson"}:
                fmt = "json"
            elif suffix in {".parquet", ".pq"}:
                fmt = "parquet"
            else:
                raise SystemExit("Unable to infer observations format; specify --experiment-format")

        if fmt == "json":
            payload = json.loads(observations_path.read_text())
        else:
            payload = pl.read_parquet(observations_path)

        with scheduler.reserve(WorkloadClass.STANDARD):
            result = record_experiment_observations(args.tenant, payload)
        output = {
            "tenant_id": args.tenant,
            "summary": result["summary"],
            "aggregated_observations": result["aggregated_observations"],
        }
        print(json.dumps(output, indent=2, sort_keys=True))
        _append_log(args.log_file, "experiment.summary", output)
        return

    if args.alert_forecast:
        summary = run_performance_check(
            args.tenant,
            root=args.performance_root,
            coverage_threshold=args.alert_threshold,
        )
        failing = summary.get("failing_horizons", [])
        if summary.get("status") == "coverage_below_threshold" and failing:
            message = {
                "tenant_id": args.tenant,
                "status": summary["status"],
                "failing_horizons": failing,
                "coverage": summary["summary"]["coverage"],
            }
            print(json.dumps({"alert": message}, indent=2, sort_keys=True))
            _append_log(args.log_file, "forecast.alert", message)
        else:
            print(json.dumps({"alert": "ok", "tenant_id": args.tenant}, indent=2, sort_keys=True))
        return

    if args.retention_report:
        if not args.retention_summary_root:
            raise SystemExit("--retention-summary-root is required when using --retention-report")
        with scheduler.reserve(WorkloadClass.STANDARD):
            summary = load_retention_summary(
                args.retention_summary_root,
                day=args.retention_report_day,
            )
        print(json.dumps(summary, indent=2, sort_keys=True))
        if args.export_observability:
            with scheduler.reserve(WorkloadClass.STANDARD):
                report = load_retention_report_full(args.retention_summary_root)
                export_retention_report(report, args.export_observability)
            print(f"[observability] wrote retention report to {args.export_observability}")
        _append_log(args.log_file, "retention.report", summary)
        return

    if args.smoke_test:
        with scheduler.reserve(WorkloadClass.HEAVY):
            summary = run_smoke_test_sync(
                args.tenant,
                start_date=_parse_datetime(args.start),
                end_date=_parse_datetime(args.end),
            )
        print(json.dumps(summary.to_dict(), indent=2, sort_keys=True))
        if args.export_observability and args.retention_summary_root:
            with scheduler.reserve(WorkloadClass.STANDARD):
                retention = load_retention_report_full(args.retention_summary_root)
                geocoding = load_geocoding_reports(args.retention_summary_root)
                export_retention_report(retention, Path(args.export_observability).with_name("retention.json"))
                export_geocoding_reports(geocoding, Path(args.export_observability).with_name("geocoding.json"))
            print(f"[observability] wrote telemetry to {Path(args.export_observability).parent}")
        _append_log(args.log_file, "smoke.test", summary.to_dict())
        return

    if args.retention_only:
        with scheduler.reserve(WorkloadClass.HEAVY):
            result = _run_retention(args)
        print("[weathervane-worker] Retention sweep complete")
        if result:
            print(result)
        return

    if args.all_tenants or args.tenant.upper() == "ALL":
        raise SystemExit("Pipeline requires a specific tenant; use --retention-only for bulk retention")

    with scheduler.reserve(WorkloadClass.HEAVY):
        pipeline_result = asyncio.run(_run_pipeline(args))
    print("[weathervane-worker] PoC pipeline complete")
    if pipeline_result:
        print(pipeline_result)

    if args.retention_after:
        with scheduler.reserve(WorkloadClass.HEAVY):
            retention_result = _run_retention(args)
        print("[weathervane-worker] Retention sweep complete")
        if retention_result:
            print(retention_result)


if __name__ == "__main__":
    main()
