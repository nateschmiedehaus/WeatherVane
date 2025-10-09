"""Simple JSON-backed state store for connector cursors and metadata."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, MutableMapping


@dataclass
class JsonStateStore:
    root: Path | str = Path("storage/metadata/state")

    def __post_init__(self) -> None:
        self.root = Path(self.root)
        self.root.mkdir(parents=True, exist_ok=True)

    def load(self, namespace: str, key: str) -> dict[str, Any]:
        path = self._path(namespace, key)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return {}

    def save(self, namespace: str, key: str, payload: MutableMapping[str, Any]) -> Path:
        path = self._path(namespace, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(dict(payload), indent=2, sort_keys=True))
        return path

    def list(self, namespace: str) -> list[str]:
        ns_path = self.root / namespace
        if not ns_path.exists():
            return []
        return sorted(p.stem for p in ns_path.glob("*.json"))

    def _path(self, namespace: str, key: str) -> Path:
        safe_namespace = namespace.replace("/", "-")
        safe_key = key.replace("/", "-")
        return self.root / safe_namespace / f"{safe_key}.json"
