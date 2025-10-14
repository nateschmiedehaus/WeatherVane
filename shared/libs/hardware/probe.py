"""Device hardware probing utilities."""

from __future__ import annotations

import json
import hashlib
import os
import platform
import shutil
import socket
import subprocess
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, MutableMapping, Optional

try:
    import psutil  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    psutil = None


@dataclass
class DeviceProfile:
    """Snapshot of host capabilities used by schedulers and workers."""

    profile_id: str
    hostname: str
    os: str
    os_version: str
    architecture: str
    cpu_model: str | None
    cpu_logical: int | None
    cpu_physical: int | None
    memory_total_bytes: int | None
    accelerators: list[dict[str, Any]]
    capabilities: dict[str, Any]
    collected_at: str
    scheduler_plan: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "DeviceProfile":
        return cls(
            profile_id=payload["profile_id"],
            hostname=payload["hostname"],
            os=payload["os"],
            os_version=payload["os_version"],
            architecture=payload["architecture"],
            cpu_model=payload.get("cpu_model"),
            cpu_logical=payload.get("cpu_logical"),
            cpu_physical=payload.get("cpu_physical"),
            memory_total_bytes=payload.get("memory_total_bytes"),
            accelerators=list(payload.get("accelerators", [])),
            capabilities=dict(payload.get("capabilities", {})),
            collected_at=payload["collected_at"],
            scheduler_plan=dict(payload["scheduler_plan"])
            if isinstance(payload.get("scheduler_plan"), Mapping)
            else None,
        )


class DeviceProfileStore:
    """Persist device profiles to a shared JSON registry."""

    def __init__(self, path: Path | str = Path("state/device_profiles.json")) -> None:
        self.path = Path(path)

    def load_all(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text())
        except json.JSONDecodeError:
            return {}

    def save(self, profile: DeviceProfile) -> Path:
        registry = self.load_all()
        duplicates = [
            key
            for key, value in registry.items()
            if isinstance(value, Mapping) and value.get("hostname") == profile.hostname
        ]
        for key in duplicates:
            if key != profile.profile_id:
                registry.pop(key, None)
        registry[profile.profile_id] = profile.to_dict()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(registry, indent=2, sort_keys=True))
        return self.path

    def save_scheduler_plan(
        self,
        profile_id: str,
        scheduler_plan: Mapping[str, Any],
    ) -> Path:
        registry = self.load_all()
        if profile_id not in registry:
            raise KeyError(f"profile_id not found: {profile_id}")
        entry = dict(registry[profile_id])
        entry["scheduler_plan"] = dict(scheduler_plan)
        registry[profile_id] = entry
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(registry, indent=2, sort_keys=True))
        return self.path

    def get(self, profile_id: str) -> DeviceProfile | None:
        registry = self.load_all()
        entry = registry.get(profile_id)
        if entry is None:
            return None
        return DeviceProfile.from_dict(entry)

    def list_profiles(self) -> list[DeviceProfile]:
        registry = self.load_all()
        return [DeviceProfile.from_dict(entry) for entry in registry.values()]


class HardwareProbe:
    """Collect hardware characteristics and optionally persist the profile."""

    def __init__(
        self,
        *,
        store: DeviceProfileStore | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.store = store
        self._now = clock or (lambda: datetime.now(timezone.utc))

    def collect(self, *, overrides: Optional[Mapping[str, Any]] = None) -> DeviceProfile:
        raw = _collect_system_snapshot()
        if overrides:
            raw.update(overrides)
        return _build_profile(raw, now=self._now())

    def collect_and_persist(
        self,
        *,
        overrides: Optional[Mapping[str, Any]] = None,
        store: DeviceProfileStore | None = None,
    ) -> DeviceProfile:
        profile = self.collect(overrides=overrides)
        active_store = store or self.store
        if active_store is None:
            active_store = DeviceProfileStore()
        active_store.save(profile)
        return profile


def collect_device_profile(*, overrides: Optional[Mapping[str, Any]] = None) -> DeviceProfile:
    """Convenience wrapper for collecting a profile without persisting it."""
    probe = HardwareProbe()
    return probe.collect(overrides=overrides)


def _build_profile(raw: MutableMapping[str, Any], *, now: datetime) -> DeviceProfile:
    accelerators = list(raw.get("accelerators", []))
    logical = raw.get("cpu_logical")
    memory_bytes = raw.get("memory_total_bytes")
    os_name = raw.get("os")
    architecture = raw.get("architecture")

    capabilities = {
        "has_accelerator": bool(accelerators),
        "supports_cuda": any(acc.get("kind") == "nvidia" for acc in accelerators),
        "supports_mps": bool(
            os_name == "Darwin" and isinstance(architecture, str) and "arm" in architecture.lower()
        ),
        "recommended_concurrency": _recommended_concurrency(logical, accelerators),
        "suggested_batch_size": _suggested_batch_size(memory_bytes, accelerators),
    }

    fingerprint_source = {
        "hostname": raw.get("hostname"),
        "architecture": architecture,
        "cpu_model": raw.get("cpu_model"),
        "cpu_logical": logical,
        "cpu_physical": raw.get("cpu_physical"),
        "accelerators": accelerators,
    }
    profile = DeviceProfile(
        profile_id=_fingerprint(fingerprint_source),
        hostname=raw.get("hostname", "unknown"),
        os=os_name or "unknown",
        os_version=raw.get("os_version", "unknown"),
        architecture=architecture or "unknown",
        cpu_model=raw.get("cpu_model"),
        cpu_logical=logical,
        cpu_physical=raw.get("cpu_physical"),
        memory_total_bytes=memory_bytes,
        accelerators=accelerators,
        capabilities=capabilities,
        collected_at=now.isoformat(),
    )
    return profile


def _collect_system_snapshot() -> MutableMapping[str, Any]:
    system = platform.system()
    architecture = platform.machine()

    hostname = platform.node() or socket.gethostname()
    os_version = platform.version() or platform.release()

    cpu_model = _detect_cpu_model(system)
    cpu_logical, cpu_physical = _detect_cpu_counts()
    memory_total_bytes = _detect_total_memory(system)
    accelerators = _detect_accelerators(system, architecture, memory_total_bytes)

    snapshot: MutableMapping[str, Any] = {
        "hostname": hostname,
        "os": system,
        "os_version": os_version,
        "architecture": architecture,
        "cpu_model": cpu_model,
        "cpu_logical": cpu_logical,
        "cpu_physical": cpu_physical,
        "memory_total_bytes": memory_total_bytes,
        "accelerators": accelerators,
    }
    return snapshot


def _detect_cpu_model(system: str) -> str | None:
    if system == "Darwin":
        output = _safe_run(("sysctl", "-n", "machdep.cpu.brand_string"))
        if output:
            return output.strip()

    if system == "Linux":
        cpuinfo = Path("/proc/cpuinfo")
        if cpuinfo.exists():
            for line in cpuinfo.read_text(encoding="utf-8", errors="ignore").splitlines():
                if "model name" in line:
                    return line.split(":", 1)[1].strip()

    candidate = platform.processor()
    if candidate:
        return candidate

    return None


def _detect_cpu_counts() -> tuple[int | None, int | None]:
    logical = os.cpu_count()
    physical: int | None = None

    if psutil is not None:  # pragma: no branch
        try:
            physical = psutil.cpu_count(logical=False)
        except Exception:  # pragma: no cover - defensive
            physical = None

    if physical is None:
        system = platform.system()
        if system == "Darwin":
            output = _safe_run(("sysctl", "-n", "hw.physicalcpu"))
            if output and output.strip().isdigit():
                physical = int(output.strip())
        elif system == "Linux":
            physical = _parse_proc_cpuinfo_physical_cores()

    return logical, physical


def _detect_total_memory(system: str) -> int | None:
    if psutil is not None:  # pragma: no branch
        try:
            return int(psutil.virtual_memory().total)
        except Exception:
            pass

    if system == "Darwin":
        output = _safe_run(("sysctl", "-n", "hw.memsize"))
        if output and output.strip().isdigit():
            return int(output.strip())

    if system == "Linux":
        meminfo = Path("/proc/meminfo")
        if meminfo.exists():
            for line in meminfo.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("MemTotal"):
                    parts = line.split()
                    if len(parts) >= 2 and parts[1].isdigit():
                        # Value is reported in kilobytes.
                        return int(parts[1]) * 1024

    if system == "Windows":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):  # type: ignore[attr-defined]
                return int(stat.ullTotalPhys)
        except Exception:
            return None

    try:
        page_size = os.sysconf("SC_PAGE_SIZE")
        phys_pages = os.sysconf("SC_PHYS_PAGES")
        if isinstance(page_size, int) and isinstance(phys_pages, int):
            return int(page_size) * int(phys_pages)
    except (AttributeError, ValueError):
        pass

    return None


def _detect_accelerators(
    system: str,
    architecture: str | None,
    memory_total_bytes: int | None,
) -> list[dict[str, Any]]:
    accelerators: list[dict[str, Any]] = []

    if shutil.which("nvidia-smi"):
        output = _safe_run(
            (
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ),
            timeout=2,
        )
        if output:
            for line in output.strip().splitlines():
                name, *rest = [segment.strip() for segment in line.split(",")]
                memory_mb = int(rest[0]) if rest and rest[0].isdigit() else None
                accelerators.append(
                    {
                        "kind": "nvidia",
                        "name": name,
                        "memory_bytes": memory_mb * 1024 * 1024 if memory_mb else None,
                    }
                )

    if system == "Darwin" and architecture:
        if "arm" in architecture.lower():
            accelerators.append(
                {
                    "kind": "apple_mps",
                    "name": "Apple Silicon GPU",
                    "memory_bytes": memory_total_bytes,
                }
            )
        elif shutil.which("system_profiler"):
            profiler = _safe_run(("system_profiler", "SPDisplaysDataType"), timeout=3)
            if profiler:
                accelerators.extend(
                    _parse_system_profiler_accelerators(profiler.splitlines())
                )

    return accelerators


def _recommended_concurrency(
    logical_cpus: Optional[int],
    accelerators: Iterable[Mapping[str, Any]],
) -> int:
    if not logical_cpus:
        return 1

    base = max(1, logical_cpus // 2)
    if any(acc.get("kind") in {"nvidia", "apple_mps"} for acc in accelerators):
        return max(base, min(logical_cpus, 8))
    return min(base, logical_cpus)


def _suggested_batch_size(
    memory_bytes: Optional[int],
    accelerators: Iterable[Mapping[str, Any]],
) -> int:
    if memory_bytes is None:
        return 32

    gigabytes = memory_bytes / (1024**3)
    if any(acc.get("kind") == "nvidia" for acc in accelerators):
        if gigabytes >= 32:
            return 512
        if gigabytes >= 16:
            return 256
        return 128

    if any(acc.get("kind") == "apple_mps" for acc in accelerators):
        if gigabytes >= 16:
            return 192
        return 128

    if gigabytes >= 32:
        return 256
    if gigabytes >= 16:
        return 128
    if gigabytes >= 8:
        return 64
    return 32


def _parse_proc_cpuinfo_physical_cores() -> int | None:
    cpuinfo = Path("/proc/cpuinfo")
    if not cpuinfo.exists():
        return None

    physical_cores: set[tuple[str, str]] = set()
    current_physical = "0"
    current_core = None
    for raw_line in cpuinfo.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line:
            if current_core is not None:
                physical_cores.add((current_physical, current_core))
            current_core = None
            continue
        if line.startswith("physical id"):
            current_physical = line.split(":", 1)[1].strip()
        elif line.startswith("core id"):
            current_core = line.split(":", 1)[1].strip()
        elif line.startswith("cpu cores") and current_core is None:
            try:
                return int(line.split(":", 1)[1].strip())
            except ValueError:
                continue

    if physical_cores:
        return len(physical_cores)
    return None


def _parse_system_profiler_accelerators(lines: Iterable[str]) -> list[dict[str, Any]]:
    accelerators: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.endswith(":"):
            if current:
                accelerators.append(current)
            current = {
                "kind": "apple_gpu",
                "name": stripped.rstrip(":"),
                "memory_bytes": None,
            }
        elif ":" in stripped:
            key, value = [segment.strip() for segment in stripped.split(":", 1)]
            if key.lower() == "chipset model":
                current["name"] = value
            elif key.lower() in {"vram (total)", "vram"}:
                memory_value = _parse_memory_value(value)
                if memory_value is not None:
                    current["memory_bytes"] = memory_value
    if current:
        accelerators.append(current)
    return accelerators


def _parse_memory_value(value: str) -> Optional[int]:
    cleaned = value.lower().replace("gb", "").replace("g", "").strip()
    try:
        gigabytes = float(cleaned)
        return int(gigabytes * (1024**3))
    except ValueError:
        return None


def _fingerprint(payload: Mapping[str, Any]) -> str:
    accelerators = payload.get("accelerators", [])
    accelerator_signature = sorted(
        {
            f"{acc.get('kind', 'unknown')}::{acc.get('name', 'unknown')}"
            for acc in accelerators
            if isinstance(acc, Mapping)
        }
    )
    digest_payload = {
        "hostname": payload.get("hostname"),
        "architecture": payload.get("architecture"),
        "cpu_model": payload.get("cpu_model"),
        "cpu_logical": payload.get("cpu_logical"),
        "cpu_physical": payload.get("cpu_physical"),
        "accelerators": accelerator_signature,
    }
    encoded = json.dumps(digest_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    try:
        digest = hashlib.sha1(encoded.encode("utf-8"), usedforsecurity=False)
    except TypeError:  # pragma: no cover - fallback for Python builds without the kwarg
        digest = hashlib.sha1(encoded.encode("utf-8"))
    return digest.hexdigest()[:12]


def _safe_run(
    command: tuple[str, ...] | list[str],
    *,
    timeout: Optional[int] = None,
) -> Optional[str]:
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    output = completed.stdout.strip()
    return output or None
