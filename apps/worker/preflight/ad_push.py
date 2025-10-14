from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from shared.libs.diffs import (
    AdPushDiff,
    AdPushDiffBuilder,
    NormalisedNode,
    load_nodes_from_payload,
)
from shared.schemas.base import GuardrailSettings
from shared.libs.automation.rollback import (
    AutomationAlertStore,
    RollbackManifest,
    RollbackManifestStore,
)


AUTOMATION_SETTINGS_ENV = "AUTOMATION_SETTINGS_ROOT"
BASELINE_SNAPSHOT_ENV = "AD_PUSH_BASELINE_ROOT"
DEFAULT_AUTOMATION_SETTINGS_ROOT = Path("storage/metadata/automation")
DEFAULT_BASELINE_ROOT = Path("storage/metadata/ad_push_baseline")


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate ad push preflight diff artifact.")
    parser.add_argument("--tenant-id", required=True, help="Tenant identifier.")
    parser.add_argument(
        "--mode",
        dest="generation_mode",
        choices=["assist", "autopilot", "manual"],
        default="assist",
        help="Generation mode for this run.",
    )
    parser.add_argument(
        "--run-id",
        dest="run_id",
        help="Optional run identifier. Defaults to adpush-<timestamp> when omitted.",
    )
    parser.add_argument(
        "--plan-run-id",
        dest="plan_run_id",
        help="Optional allocator plan run identifier to link in the artifact.",
    )
    parser.add_argument(
        "--proposed-path",
        required=True,
        help="Path to proposed actions JSON exported by allocator/autopilot.",
    )
    parser.add_argument(
        "--baseline-path",
        help="Optional path to baseline entity snapshot JSON. When omitted, baseline nodes are empty (treated as all create).",
    )
    parser.add_argument(
        "--guardrails-path",
        help="Optional path to guardrail settings JSON. Defaults to AutomationSettings defaults.",
    )
    parser.add_argument(
        "--generated-at",
        help="Override generated_at timestamp (ISO8601). Defaults to current UTC time.",
    )
    parser.add_argument(
        "--window-start",
        help="Optional ISO8601 window start for the proposed push.",
    )
    parser.add_argument(
        "--window-end",
        help="Optional ISO8601 window end for the proposed push.",
    )
    parser.add_argument(
        "--output-dir",
        default="storage/metadata/ad_push_preflight",
        help="Directory to persist per-run diff artifacts.",
    )
    parser.add_argument(
        "--state-path",
        default="state/ad_push_diffs.json",
        help="Path to aggregated diff history artifact.",
    )
    parser.add_argument(
        "--notes",
        action="append",
        default=[],
        help="Optional note to append to the diff (can be passed multiple times).",
    )
    parser.add_argument(
        "--max-state-records",
        type=int,
        default=10,
        help="Maximum diff records to retain in the aggregated state file.",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def execute(args: argparse.Namespace) -> tuple[AdPushDiff, Path, Path]:
    run_id = args.run_id or _generate_run_id()
    generated_at = _parse_datetime(args.generated_at) or datetime.now(timezone.utc)
    window_start = _parse_datetime(args.window_start)
    window_end = _parse_datetime(args.window_end)
    guardrails = _load_guardrails(args.guardrails_path, tenant_id=args.tenant_id)

    proposed_payload = _read_json(Path(args.proposed_path))
    proposed_nodes = load_nodes_from_payload(proposed_payload)
    if not proposed_nodes:
        raise SystemExit("No proposed entities provided; cannot build diff.")

    baseline_payload, baseline_nodes = _resolve_baseline(
        tenant_id=args.tenant_id,
        baseline_path=args.baseline_path,
        proposed_nodes=proposed_nodes,
    )

    builder = AdPushDiffBuilder(guardrails)
    diff = builder.build(
        baseline_nodes=baseline_nodes,
        proposed_nodes=proposed_nodes,
        tenant_id=args.tenant_id,
        run_id=run_id,
        generation_mode=args.generation_mode,
        generated_at=generated_at,
        window_start=window_start,
        window_end=window_end,
        notes=_normalise_notes(args.notes),
        source_plan_id=args.plan_run_id,
    )

    artifact_path = _write_artifact(diff, Path(args.output_dir), args.tenant_id)
    state_path = _update_state(diff, Path(args.state_path), args.max_state_records)

    manifest = RollbackManifest.from_diff(
        diff,
        baseline_payload=baseline_payload or {},
        proposed_payload=proposed_payload,
        guardrails=guardrails,
    )
    manifest_store = RollbackManifestStore()
    manifest_store.save(manifest)
    alert_store = AutomationAlertStore()
    alert_store.record_manifest(manifest)

    return diff, artifact_path, state_path


def main(argv: Iterable[str] | None = None) -> None:
    args = parse_args(argv)
    diff, artifact_path, state_path = execute(args)
    summary = {
        "run_id": diff.run_id,
        "tenant_id": diff.tenant_id,
        "generation_mode": diff.generation_mode,
        "artifact_path": str(artifact_path),
        "state_path": str(state_path),
        "entity_count": len(diff.entities),
        "guardrail_count": len(diff.guardrails),
    }
    manifest_store = RollbackManifestStore()
    manifest_path = manifest_store.root / diff.tenant_id / f"{diff.run_id}.json"
    summary["rollback_manifest_path"] = str(manifest_path)
    alerts_store = AutomationAlertStore()
    if alerts_store.path.exists():
        summary["alert_state_path"] = str(alerts_store.path)
    print(json.dumps(summary, indent=2, sort_keys=True))


def _read_json(path: Path) -> object:
    if not path.exists():
        raise SystemExit(f"File not found: {path}")
    text = path.read_text()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise SystemExit(f"Failed to parse JSON from {path}: {exc}") from exc


def _load_guardrails(path: str | None, *, tenant_id: str | None = None) -> GuardrailSettings:
    if path:
        payload = _read_json(Path(path))
        if isinstance(payload, Mapping):
            return GuardrailSettings(**payload)
        raise SystemExit("Guardrails payload must be a JSON object.")

    settings_root = _automation_settings_root()
    candidates: list[Path] = []
    if tenant_id:
        candidates.extend(
            [
                settings_root / f"{tenant_id}.json",
                settings_root / tenant_id / "settings.json",
            ]
        )
    candidates.append(settings_root / "guardrails.json")

    for candidate in candidates:
        if not candidate.exists():
            continue
        payload = _read_json(candidate)
        guardrails_payload = _extract_guardrails_payload(payload)
        if isinstance(guardrails_payload, Mapping):
            return GuardrailSettings(**guardrails_payload)

    return GuardrailSettings()


def _automation_settings_root() -> Path:
    root = os.getenv(AUTOMATION_SETTINGS_ENV)
    return Path(root).expanduser() if root else DEFAULT_AUTOMATION_SETTINGS_ROOT


def _resolve_baseline(
    *,
    tenant_id: str,
    baseline_path: str | None,
    proposed_nodes: Sequence[NormalisedNode],
) -> tuple[Any | None, list[NormalisedNode]]:
    if baseline_path:
        payload = _read_json(Path(baseline_path))
    else:
        payload = _load_baseline_payload_from_store(tenant_id)

    if payload is None:
        return None, []

    try:
        baseline_nodes = load_nodes_from_payload(payload)
    except Exception:
        return payload, []

    aligned = _align_baseline_nodes(baseline_nodes, proposed_nodes)
    return payload, aligned


def _baseline_root() -> Path:
    root = os.getenv(BASELINE_SNAPSHOT_ENV)
    return Path(root).expanduser() if root else DEFAULT_BASELINE_ROOT


def _load_baseline_payload_from_store(tenant_id: str) -> Any | None:
    root = _baseline_root()
    path = root / f"{tenant_id}.json"
    if not path.exists():
        return None
    return _read_json(path)


def _align_baseline_nodes(
    baseline_nodes: Sequence[NormalisedNode],
    proposed_nodes: Sequence[NormalisedNode],
) -> list[NormalisedNode]:
    proposed_lookup = {node.key: node for node in proposed_nodes}
    aligned: list[NormalisedNode] = []
    for node in baseline_nodes:
        match = proposed_lookup.get(node.key)
        if match and match.anchor and node.anchor != match.anchor:
            node.anchor = match.anchor
        aligned.append(node)
    return aligned


def _extract_guardrails_payload(payload: object) -> Mapping[str, object] | None:
    if not isinstance(payload, Mapping):
        return None
    guardrails_raw = payload.get("guardrails")
    if isinstance(guardrails_raw, Mapping):
        return guardrails_raw
    settings = payload.get("settings")
    if isinstance(settings, Mapping):
        guardrails_raw = settings.get("guardrails")
        if isinstance(guardrails_raw, Mapping):
            return guardrails_raw
    return None


def _generate_run_id() -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    return f"adpush-{timestamp}"


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _write_artifact(diff: AdPushDiff, root: Path, tenant_id: str) -> Path:
    tenant_dir = root / tenant_id
    tenant_dir.mkdir(parents=True, exist_ok=True)
    path = tenant_dir / f"{diff.run_id}.json"
    payload = diff.to_dict()
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return path


def _update_state(diff: AdPushDiff, path: Path, max_records: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: list[dict[str, object]] = []
    if path.exists():
        data = _read_json(path)
        if isinstance(data, list):
            existing = [
                item for item in data if isinstance(item, dict)
            ]
    payload = [diff.to_dict(), *existing]
    if max_records > 0:
        payload = payload[:max_records]
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))
    return path


def _normalise_notes(notes: Sequence[str]) -> list[str]:
    return [note for note in notes if isinstance(note, str) and note.strip()]


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    main()
