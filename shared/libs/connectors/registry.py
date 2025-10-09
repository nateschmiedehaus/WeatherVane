"""Helpers for loading connector manifests from metadata files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional

import yaml

from .sdk import AuthMethod, Capability, ConnectorManifest, SecretField

DEFAULT_REGISTRY_ROOT = Path("storage/metadata/connectors")


class ConnectorRegistryError(RuntimeError):
    pass


def list_manifests(root: Path | str | None = None) -> Dict[str, ConnectorManifest]:
    base = _resolve_root(root)
    manifests: Dict[str, ConnectorManifest] = {}
    for path in base.glob("*.yaml"):
        manifest = _load_manifest(path)
        manifests[manifest.slug] = manifest
    for path in base.glob("*.json"):
        manifest = _load_manifest(path)
        manifests[manifest.slug] = manifest
    return manifests


def load_manifest(slug: str, root: Path | str | None = None) -> ConnectorManifest:
    base = _resolve_root(root)
    for extension in (".yaml", ".yml", ".json"):
        candidate = base / f"{slug}{extension}"
        if candidate.exists():
            return _load_manifest(candidate)
    raise ConnectorRegistryError(f"No connector manifest found for slug '{slug}' in {base}")


def _load_manifest(path: Path) -> ConnectorManifest:
    raw = _read_manifest(path)
    try:
        return ConnectorManifest(
            slug=str(raw["slug"]),
            display_name=str(raw.get("display_name") or raw["slug"].title()),
            logo_path=str(raw.get("logo_path") or ""),
            description=str(raw.get("description") or ""),
            auth_method=AuthMethod(raw.get("auth_method", "api_key")),
            secret_fields=_secret_fields(raw.get("secret_fields", [])),
            categories=tuple(str(value) for value in raw.get("categories", [])),
            capabilities=_capabilities(raw.get("capabilities", [])),
        )
    except KeyError as exc:  # pragma: no cover - invalid manifest
        raise ConnectorRegistryError(f"Malformed manifest {path}: missing {exc}") from exc


def _secret_fields(raw_fields: Iterable[Mapping[str, object]]) -> tuple[SecretField, ...]:
    fields = []
    for entry in raw_fields:
        fields.append(
            SecretField(
                key=str(entry.get("key")),
                label=str(entry.get("label", entry.get("key", ""))),
                required=bool(entry.get("required", True)),
            )
        )
    return tuple(fields)


def _capabilities(values: Iterable[str]) -> tuple[Capability, ...]:
    return tuple(Capability(value) for value in values)


def _read_manifest(path: Path) -> Mapping[str, object]:
    if path.suffix in {".yaml", ".yml"}:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if path.suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    raise ConnectorRegistryError(f"Unsupported manifest format: {path.suffix}")


def _resolve_root(root: Path | str | None) -> Path:
    if root:
        return Path(root).expanduser().resolve()
    return DEFAULT_REGISTRY_ROOT.resolve()
