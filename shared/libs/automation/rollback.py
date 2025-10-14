from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from shared.libs.diffs import AdPushDiff, GuardrailBreach
from shared.libs.diffs.ad_push import GuardrailSeverity
from shared.schemas.base import GuardrailSettings


ROLLBACK_ROOT_ENV = "AD_PUSH_ROLLBACK_ROOT"
DEFAULT_ROLLBACK_ROOT = Path("storage/metadata/ad_push_rollback")
ALERT_STATE_ENV = "AD_PUSH_ALERT_STATE_PATH"
DEFAULT_ALERT_STATE_PATH = Path("state/ad_push_alerts.json")


def _parse_datetime(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)


@dataclass(slots=True)
class RollbackManifest:
    run_id: str
    tenant_id: str
    generated_at: datetime
    baseline: Any
    proposed: Any
    guardrails: GuardrailSettings
    guardrail_breaches: list[GuardrailBreach] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @classmethod
    def from_diff(
        cls,
        diff: AdPushDiff,
        *,
        baseline_payload: Any,
        proposed_payload: Any,
        guardrails: GuardrailSettings,
    ) -> RollbackManifest:
        return cls(
            run_id=diff.run_id,
            tenant_id=diff.tenant_id,
            generated_at=diff.generated_at,
            baseline=baseline_payload,
            proposed=proposed_payload,
            guardrails=guardrails,
            guardrail_breaches=list(diff.guardrails),
            notes=list(diff.notes),
        )

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> RollbackManifest:
        guardrails_payload = payload.get("guardrails") or {}
        guardrail_breaches_raw = payload.get("guardrail_breaches") or []
        return cls(
            run_id=str(payload.get("run_id") or ""),
            tenant_id=str(payload.get("tenant_id") or ""),
            generated_at=_parse_datetime(payload.get("generated_at")),
            baseline=payload.get("baseline"),
            proposed=payload.get("proposed"),
            guardrails=GuardrailSettings(**guardrails_payload),
            guardrail_breaches=[
                GuardrailBreach.from_dict(item)
                for item in guardrail_breaches_raw
                if isinstance(item, dict)
            ],
            notes=[
                str(item)
                for item in payload.get("notes") or []
                if item is not None
            ],
        )

    @property
    def critical_guardrails(self) -> list[GuardrailBreach]:
        return [
            breach
            for breach in self.guardrail_breaches
            if breach.severity is GuardrailSeverity.CRITICAL
        ]

    @property
    def rollback_recommended(self) -> bool:
        return bool(self.critical_guardrails)

    @property
    def critical_guardrail_codes(self) -> list[str]:
        return [breach.code for breach in self.critical_guardrails]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "tenant_id": self.tenant_id,
            "generated_at": self.generated_at.isoformat(),
            "baseline": self.baseline,
            "proposed": self.proposed,
            "guardrails": self.guardrails.model_dump(),
            "guardrail_breaches": [breach.to_dict() for breach in self.guardrail_breaches],
            "notes": list(self.notes),
            "rollback_recommended": self.rollback_recommended,
            "critical_guardrail_codes": [breach.code for breach in self.critical_guardrails],
        }


@dataclass(slots=True)
class AutomationAlert:
    run_id: str
    tenant_id: str
    generated_at: datetime
    severity: GuardrailSeverity
    codes: list[str]
    message: str
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "tenant_id": self.tenant_id,
            "generated_at": self.generated_at.isoformat(),
            "severity": self.severity.value,
            "codes": list(self.codes),
            "message": self.message,
            "notes": list(self.notes),
        }


class RollbackManifestStore:
    def __init__(self, root: Path | str | None = None) -> None:
        env_root = os.getenv(ROLLBACK_ROOT_ENV)
        self.root = Path(root or env_root or DEFAULT_ROLLBACK_ROOT)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, manifest: RollbackManifest) -> Path:
        path = self.root / manifest.tenant_id / f"{manifest.run_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = manifest.to_dict()
        path.write_text(json.dumps(payload, indent=2, sort_keys=True))

        latest_path = path.parent / "latest.json"
        latest_payload = dict(payload)
        latest_payload["manifest_path"] = str(path)
        latest_path.write_text(json.dumps(latest_payload, indent=2, sort_keys=True))
        return path

    def load(self, tenant_id: str, run_id: str) -> RollbackManifest | None:
        path = self.root / tenant_id / f"{run_id}.json"
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text())
        except json.JSONDecodeError:
            return None
        if not isinstance(payload, dict):
            return None
        payload.setdefault("run_id", run_id)
        payload.setdefault("tenant_id", tenant_id)
        return RollbackManifest.from_dict(payload)


class AutomationAlertStore:
    def __init__(self, path: Path | str | None = None, max_records: int = 50) -> None:
        env_path = os.getenv(ALERT_STATE_ENV)
        self.path = Path(path or env_path or DEFAULT_ALERT_STATE_PATH)
        self.max_records = max_records

    def append(self, alert: AutomationAlert) -> Path:
        records = self._read()
        records.insert(0, alert.to_dict())
        trimmed = records[: self.max_records]
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(trimmed, indent=2, sort_keys=True))
        return self.path

    def record_manifest(self, manifest: RollbackManifest) -> Path | None:
        if not manifest.rollback_recommended:
            return None
        alert = AutomationAlert(
            run_id=manifest.run_id,
            tenant_id=manifest.tenant_id,
            generated_at=manifest.generated_at,
            severity=GuardrailSeverity.CRITICAL,
            codes=[breach.code for breach in manifest.critical_guardrails],
            message="Critical guardrail breaches detected; rollback recommended.",
            notes=list(manifest.notes),
        )
        return self.append(alert)

    def _read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        try:
            payload = json.loads(self.path.read_text())
        except json.JSONDecodeError:
            return []
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        return []
