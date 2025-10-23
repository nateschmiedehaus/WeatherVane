"""Pytest configuration file for WeatherVane."""

import sys
from pathlib import Path

# Add the repository root to sys.path so imports work correctly
root = Path(__file__).parent
if str(root) not in sys.path:
    sys.path.insert(0, str(root))
