"""Test imports."""
import sys
from pathlib import Path

def test_python_path():
    """Verify Python path includes project root."""
    project_root = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(project_root))
    print("\nPython path:")
    for path in sys.path:
        print(f"  {path}")
    assert str(project_root) in sys.path