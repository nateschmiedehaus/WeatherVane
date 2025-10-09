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


def test_parse_args_all_tenants():
    args = parse_args(["ALL", "--retention-only", "--all-tenants"])
    assert args.all_tenants is True
    assert args.tenant == "ALL"
