"""Meta-evaluation report contract and evaluator.

This module re-exports ModelingMetaEvaluator from the shared meta_evaluation module
for backwards compatibility with code that imports from shared.contracts.
"""

from __future__ import annotations

from shared.meta_evaluation import ModelingMetaEvaluator

__all__ = ["ModelingMetaEvaluator"]
