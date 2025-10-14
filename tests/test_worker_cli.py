from apps.worker.run import parse_args


def test_parse_args_defaults():
    args = parse_args([])
    assert args.tenant == "demo-tenant"
    assert args.retention_only is False
    assert args.retention_days == 365
    assert args.retention_webhook_url is None
    assert args.all_tenants is False
    assert args.retention_summary_root is None
    assert args.context_root is None
    assert args.retention_report is False
    assert args.retention_report_day is None
    assert args.smoke_test is False
    assert args.export_observability is None
    assert args.log_file is None
    assert args.rl_shadow is False
    assert args.rl_episodes == 30
    assert args.rl_epsilon == 0.25
    assert args.rl_noise == 0.06
    assert args.rl_seed == 17
    assert args.rl_max_guardrail_breaches == 2
    assert args.rl_output is None
    assert args.creative_report is False
    assert args.creative_dataset is None
    assert args.creative_output is None
    assert args.saturation_report is False
    assert args.saturation_output is None
    assert abs(args.fairness_floor - 0.8) < 1e-9
    assert abs(args.saturation_roas_floor - 1.15) < 1e-9
    assert args.saturation_budget is None


def test_parse_args_retention_only():
    args = parse_args([
        "acme",
        "--retention-only",
        "--retention-days",
        "45",
        "--lake-root",
        "tmp/lake",
        "--retention-webhook-url",
        "https://example.test/hook",
        "--retention-summary-root",
        "state/retention",
        "--context-root",
        "storage/metadata/data_context",
        "--retention-report",
        "--retention-report-day",
        "2024-05-01",
        "--smoke-test",
        "--export-observability",
        "telemetry/out.json",
        "--log-file",
        "logs/events.ndjson",
    ])
    assert args.tenant == "acme"
    assert args.retention_only is True
    assert args.retention_days == 45
    assert args.lake_root == "tmp/lake"
    assert args.retention_webhook_url == "https://example.test/hook"
    assert args.retention_summary_root == "state/retention"
    assert args.context_root == "storage/metadata/data_context"
    assert args.retention_report is True
    assert args.retention_report_day == "2024-05-01"
    assert args.smoke_test is True
    assert args.export_observability == "telemetry/out.json"
    assert args.log_file == "logs/events.ndjson"


def test_parse_args_rl_shadow_flags():
    args = parse_args([
        "demo-tenant",
        "--rl-shadow",
        "--rl-episodes",
        "12",
        "--rl-epsilon",
        "0.4",
        "--rl-noise",
        "0.1",
        "--rl-seed",
        "9",
        "--rl-max-guardrail-breaches",
        "3",
        "--rl-output",
        "tmp/shadow.json",
    ])
    assert args.rl_shadow is True
    assert args.rl_episodes == 12
    assert abs(args.rl_epsilon - 0.4) < 1e-9
    assert abs(args.rl_noise - 0.1) < 1e-9
    assert args.rl_seed == 9
    assert args.rl_max_guardrail_breaches == 3
    assert args.rl_output == "tmp/shadow.json"


def test_parse_args_creative_report_flags():
    args = parse_args([
        "demo-tenant",
        "--creative-report",
        "--creative-dataset",
        "data/creatives.parquet",
        "--creative-output",
        "reports/out.json",
    ])
    assert args.creative_report is True
    assert args.creative_dataset == "data/creatives.parquet"
    assert args.creative_output == "reports/out.json"


def test_parse_args_saturation_report_flags():
    args = parse_args([
        "demo-tenant",
        "--saturation-report",
        "--saturation-output",
        "experiments/custom/saturation.json",
        "--fairness-floor",
        "0.9",
        "--saturation-roas-floor",
        "1.2",
        "--saturation-budget",
        "1024.5",
    ])
    assert args.saturation_report is True
    assert args.saturation_output == "experiments/custom/saturation.json"
    assert abs(args.fairness_floor - 0.9) < 1e-9
    assert abs(args.saturation_roas_floor - 1.2) < 1e-9
    assert abs(args.saturation_budget - 1024.5) < 1e-9


def test_parse_args_all_tenants():
    args = parse_args(["ALL", "--retention-only", "--all-tenants"])
    assert args.all_tenants is True
    assert args.tenant == "ALL"
