"""Credential vault helpers with environment fallbacks."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping


class CredentialVaultError(RuntimeError):
    """Raised when vault contents are unavailable or malformed."""


@dataclass(slots=True)
class ResolvedSecrets:
    """Secrets resolved for a service alongside provenance metadata."""

    secrets: dict[str, str]
    source: str
    key_sources: dict[str, str]


class CredentialVault:
    """JSON-backed credential vault with optional environment fallbacks."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path or os.getenv("WV_VAULT_PATH", "state/security/credentials.json")).expanduser()
        self._cache: dict[str, dict[str, str]] | None = None

    def service(self, slug: str) -> dict[str, str]:
        """Return vault-stored secrets for a service (shallow copy)."""

        data = self._load()
        return dict(data.get(slug, {}))

    def resolve(
        self,
        slug: str,
        env_mapping: Mapping[str, str],
        *,
        required: Iterable[str] | None = None,
    ) -> ResolvedSecrets:
        """Resolve secrets for ``slug`` combining vault values with env fallbacks."""

        required_keys = set(required or ())
        vault_values = self.service(slug)
        secrets: dict[str, str] = {}
        key_sources: dict[str, str] = {}

        for key, env_var in env_mapping.items():
            if key in vault_values:
                secrets[key] = vault_values[key]
                key_sources[key] = "vault"
                continue
            env_value = os.getenv(env_var)
            if env_value:
                secrets[key] = env_value
                key_sources[key] = "env"

        missing = [key for key in required_keys if key not in secrets]
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise CredentialVaultError(f"Missing required secrets for '{slug}': {missing_list}")

        if not secrets:
            raise CredentialVaultError(f"No secrets resolved for '{slug}'")

        if all(source == "vault" for source in key_sources.values()):
            source = "vault"
        elif all(source == "env" for source in key_sources.values()):
            source = "env"
        else:
            source = "mixed"

        return ResolvedSecrets(secrets=secrets, source=source, key_sources=key_sources)

    def _load(self) -> dict[str, dict[str, str]]:
        if self._cache is not None:
            return self._cache
        if not self.path.exists():
            self._cache = {}
            return self._cache
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:  # pragma: no cover - defensive branch
            raise CredentialVaultError(f"Credential vault {self.path} contains invalid JSON") from exc
        services = raw.get("services") if isinstance(raw, dict) else None
        if services is None:
            if isinstance(raw, dict):
                services = raw
            else:
                raise CredentialVaultError(f"Credential vault {self.path} must be a JSON object")
        if not isinstance(services, dict):
            raise CredentialVaultError(f"Credential vault {self.path} has non-object 'services'")
        parsed: dict[str, dict[str, str]] = {}
        for slug, values in services.items():
            if not isinstance(values, Mapping):
                raise CredentialVaultError(f"Credential vault entry '{slug}' must be an object")
            parsed[str(slug)] = {
                str(key): str(value)
                for key, value in values.items()
                if value is not None
            }
        self._cache = parsed
        return self._cache
