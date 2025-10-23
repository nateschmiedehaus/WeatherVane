"""Automation helpers shared across product surfaces."""

from .rollback import AutomationAlert, RollbackManifest, AutomationAlertStore, RollbackManifestStore
from .simulation import (
    AgentDecision,
    ClosedLoopSimulationHarness,
    FeedbackSignal,
    SimulationAgent,
    SimulationMetrics,
    SimulationResult,
    SimulationScenario,
    SimulationTask,
)

__all__ = [
    "AutomationAlert",
    "RollbackManifest",
    "AutomationAlertStore",
    "RollbackManifestStore",
    "AgentDecision",
    "ClosedLoopSimulationHarness",
    "FeedbackSignal",
    "SimulationAgent",
    "SimulationMetrics",
    "SimulationResult",
    "SimulationScenario",
    "SimulationTask",
]
