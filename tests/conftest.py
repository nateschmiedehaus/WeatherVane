import sys
from importlib import import_module
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEPS_DIR = PROJECT_ROOT / ".deps"
TESTS_DIR = PROJECT_ROOT / "tests"
TESTS_SHARED_DIR = TESTS_DIR / "shared"


def _configure_sys_path() -> None:
    tests_real = TESTS_DIR.resolve()

    def _is_tests_path(entry: str) -> bool:
        try:
            return Path(entry).resolve() == tests_real
        except Exception:
            return False

    for entry in list(sys.path):
        if entry and entry.startswith("pkgres:"):  # pragma: no cover - virtual path artifacts
            continue
        if _is_tests_path(entry):
            sys.path.remove(entry)

    root_str = str(PROJECT_ROOT.resolve())
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    deps_str = str(DEPS_DIR.resolve())
    if deps_str not in sys.path:
        sys.path.insert(1, deps_str)


def _ensure_root_shared_package() -> None:
    tests_prefix = str(TESTS_SHARED_DIR.resolve())
    shared_mod = sys.modules.get("shared")
    if shared_mod:
        shared_file = getattr(shared_mod, "__file__", "") or ""
        if tests_prefix in shared_file:
            for key in list(sys.modules.keys()):
                if key == "shared" or key.startswith("shared."):
                    sys.modules.pop(key, None)

    shared_mod = import_module("shared")
    shared_file = getattr(shared_mod, "__file__", "") or ""
    root_prefix = str((PROJECT_ROOT / "shared").resolve())
    if root_prefix not in shared_file:
        raise ImportError(
            f"Expected shared package from {root_prefix}, but loaded {shared_file}"
        )


_configure_sys_path()
_ensure_root_shared_package()

def pytest_ignore_collect(collection_path, config):
    """Ignore test collection in tests/shared directory since it shadows the root shared module."""
    # Don't collect tests from tests/shared as it's not actually test code
    if "tests/shared" in str(collection_path):
        return True
    return False


def pytest_configure(config):
    """Hook that runs before test collection starts - this is the right hook for pythonpath."""
    _configure_sys_path()
    _ensure_root_shared_package()


def pytest_sessionstart(session):
    """Remove stale MCP PID lock file before test session starts.

    The MCP server uses state/.mcp.pid to prevent multiple instances.
    Stale locks from previous runs can cause MCP tests to fail with
    "MCP process exited unexpectedly" errors.
    """
    pid_lock_path = PROJECT_ROOT / "state" / ".mcp.pid"
    if pid_lock_path.exists():
        try:
            pid_lock_path.unlink()
        except Exception:
            pass  # Non-critical if cleanup fails
