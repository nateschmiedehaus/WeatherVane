"""Context service to store dataset profiles and derive adaptive tags."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Mapping

import json

from .models import ContextSnapshot, DatasetProfile, ProfileFinding, ensure_directory


DEFAULT_ROOT = Path("storage/metadata/data_context")


@dataclass
class ContextService:
    """Collects dataset profiles and emits context tags per tenant."""

    root: Path = DEFAULT_ROOT
    _profiles: Dict[str, List[DatasetProfile]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        ensure_directory(self.root)

    def reset(self, tenant_id: str) -> None:
        self._profiles.pop(tenant_id, None)

    def record_profile(self, tenant_id: str, profile: DatasetProfile) -> None:
        bucket = self._profiles.setdefault(tenant_id, [])
        bucket.append(profile)

    def derive_tags(
        self, tenant_id: str, metadata: Mapping[str, object] | None = None
    ) -> List[str]:
        profiles = self._profiles.get(tenant_id, [])
        return self._compute_tags(profiles, metadata)

    def snapshot(self, tenant_id: str, metadata: Mapping[str, object] | None = None) -> ContextSnapshot:
        profiles = self._profiles.get(tenant_id, [])
        tags = self._compute_tags(profiles, metadata)
        snapshot = ContextSnapshot(
            tenant_id=tenant_id,
            created_at=datetime.utcnow(),
            dataset_profiles=list(profiles),
            tags=tags,
            metadata=dict(metadata or {}),
        )
        self._write_snapshot(snapshot)
        return snapshot

    def latest_snapshot(self, tenant_id: str) -> ContextSnapshot | None:
        files = sorted(self.root.glob(f"{tenant_id}_*.json"))
        if not files:
            return None
        latest = files[-1]
        payload = json.loads(latest.read_text())
        return ContextSnapshot.from_dict(payload)

    # Internal -----------------------------------------------------------------

    def _compute_tags(
        self, profiles: Iterable[DatasetProfile], metadata: Mapping[str, object] | None
    ) -> List[str]:
        tags: List[str] = []
        metadata = metadata or {}

        profile_map = {profile.name: profile for profile in profiles}

        # History coverage tags
        orders_profile = profile_map.get("orders")
        if orders_profile and orders_profile.row_count < 30:
            tags.append("history.short")
        if orders_profile and orders_profile.row_count == 0:
            tags.append("history.missing_orders")

        # Ads coverage
        ads_profile = profile_map.get("ads")
        if ads_profile and ads_profile.row_count == 0:
            tags.append("ads.missing")
        elif ads_profile and ads_profile.row_count < 10:
            tags.append("ads.sparse")

        # Weather source info
        weather_profile = profile_map.get("weather")
        source_hint = metadata.get("weather_source")
        if source_hint == "stub":
            tags.append("weather.stubbed")
        elif weather_profile and weather_profile.row_count == 0:
            tags.append("weather.missing")

        geo_ratio = metadata.get("orders_geocoded_ratio")
        if isinstance(geo_ratio, (int, float)):
            if geo_ratio <= 0.2:
                tags.append("geo.missing")
            elif geo_ratio < 0.8:
                tags.append("geo.partial")

        # Null heavy columns
        for profile in profiles:
            high_nulls = [col for col, ratio in profile.null_ratios.items() if ratio >= 0.2]
            if high_nulls:
                tags.append(f"nulls.high.{profile.name}")
                profile.findings.append(
                    ProfileFinding(
                        code="high_null_ratio",
                        severity="warning",
                        message=f"High null ratio in {profile.name}: {', '.join(high_nulls)}",
                        details={"columns": high_nulls},
                    )
                )

        return sorted(set(tags))

    def _write_snapshot(self, snapshot: ContextSnapshot) -> None:
        path = self.root / f"{snapshot.tenant_id}_{snapshot.created_at.isoformat().replace(':', '-')}.json"
        ensure_directory(self.root)
        path.write_text(json.dumps(snapshot.to_dict(), indent=2))


default_context_service = ContextService()
