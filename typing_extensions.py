"""
Compatibility shim for typing_extensions with Sentinel backport.

This module loads the original `typing_extensions` from site-packages under a
private alias and re-exports all public symbols, adding a minimal Sentinel
implementation when the upstream version does not provide one (Python 3.10 +
older wheels on Apple Silicon miss it).
"""

from __future__ import annotations

from importlib import util as _importlib_util
from importlib import machinery as _importlib_machinery
from pathlib import Path as _Path
import sys as _sys
import types as _types


def _load_original() -> _types.ModuleType:
    origin = _Path(__file__).resolve().parent
    search_paths = [p for p in _sys.path if p and _Path(p).resolve() != origin]
    for entry in search_paths:
        candidate = _Path(entry) / "typing_extensions.py"
        if candidate.exists():
            spec = _importlib_util.spec_from_file_location("_typing_extensions_orig", candidate)
            if spec and spec.loader:
                module = _importlib_util.module_from_spec(spec)
                spec.loader.exec_module(module)
                return module
    raise ImportError("Unable to locate upstream typing_extensions module")


_orig = _load_original()

__all__ = list(getattr(_orig, "__all__", []))

for name in __all__:
    globals()[name] = getattr(_orig, name)

for name in dir(_orig):
    if name.startswith("_"):
        continue
    globals().setdefault(name, getattr(_orig, name))


if "Sentinel" not in globals():
    class _PatchedSentinel:
        __slots__ = ("__name__",)

        def __init__(self, name: str) -> None:
            self.__name__ = name

        def __repr__(self) -> str:  # pragma: no cover - trivial helper
            return self.__name__

    def Sentinel(name: str, *, module: str | None = None) -> _PatchedSentinel:
        qualified = f"{module}.{name}" if module else name
        return _PatchedSentinel(qualified)

    globals()["Sentinel"] = Sentinel
    __all__.append("Sentinel")


if "NoExtraItems" not in globals():
    class _NoExtraItems:
        __slots__ = ()

        def __repr__(self) -> str:  # pragma: no cover - data marker
            return "typing_extensions.NoExtraItems"

    NoExtraItems = _NoExtraItems()
    globals()["NoExtraItems"] = NoExtraItems
    __all__.append("NoExtraItems")
