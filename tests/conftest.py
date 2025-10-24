import os
import sys
from pathlib import Path

def pytest_configure(config):
    """Hook that runs before test collection starts - this is the right hook for pythonpath."""
    # Add project root to path for module imports
    project_root = Path(__file__).resolve().parent.parent
    deps_dir = project_root / ".deps"

    # Add .deps first so vendored packages take precedence
    if str(deps_dir) not in sys.path:
        sys.path.insert(0, str(deps_dir))

    # Then add project root
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))