import os
import sys
from pathlib import Path


def pytest_ignore_collect(collection_path, config):
    """Ignore test collection in tests/shared directory since it shadows the root shared module."""
    # Don't collect tests from tests/shared as it's not actually test code
    if "tests/shared" in str(collection_path):
        return True
    return False


def pytest_configure(config):
    """Hook that runs before test collection starts - this is the right hook for pythonpath."""
    # Add project root to path for module imports
    project_root = Path(__file__).resolve().parent.parent
    deps_dir = project_root / ".deps"
    tests_dir = project_root / "tests"

    # Remove tests directory from sys.path if present
    # This prevents tests/shared from shadowing /shared
    tests_str = str(tests_dir.resolve())
    while tests_str in sys.path:
        sys.path.remove(tests_str)

    # Add project root first (before .deps)
    root_str = str(project_root.resolve())
    if root_str not in sys.path:
        sys.path.insert(0, root_str)

    # Then add .deps so vendored packages take precedence
    deps_str = str(deps_dir.resolve())
    if deps_str not in sys.path:
        sys.path.insert(1, deps_str)