"""Shared library utilities for WeatherVane services."""

__all__ = [
    "automation",
    "caching",
    "causal",
    "connectors",
    "diffs",
    "geography",
    "hardware",
    "logging",
    "modeling",
    "performance",
    "storage",
    "tagging",
    "testing",
]

import sys
sys.stderr.write("shared.libs init loaded from %s\n" % __file__)
