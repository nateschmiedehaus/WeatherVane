"""Tests for the closed-loop autonomous team simulation harness."""

from __future__ import annotations

from typing import Iterable, Sequence

from shared.libs.automation.simulation import (
    AgentDecision,
    ClosedLoopSimulationHarness,
    FeedbackSignal,
    SimulationAgent,
    SimulationScenario,
    SimulationTask,
)


def _policy_for_action(agent_id: str, action: str, confidence: float) -> SimulationAgent:
    def policy(snapshot):
        if snapshot.active_task is None:
            return None
        return AgentDecision(
            agent_id=agent_id,
            task_id=snapshot.active_task.id,
            action=action,
            confidence=confidence,
            rationale="policy stub",
        )

    return SimulationAgent(agent_id=agent_id, capabilities={"analysis", "execution"}, policy=policy)


def test_closed_loop_harness_completes_task_when_quorum_met() -> None:
    task = SimulationTask(
        id="weather-activation",
        description="Activate weather automation after guardrail review",
        target_action="activate",
        required_capabilities={"analysis", "execution"},
        quorum=1.5,
    )
    scenario = SimulationScenario(name="Activation happy path", tasks=[task])

    atlas = _policy_for_action("atlas", "activate", 0.9)
    reviewer = _policy_for_action("reviewer", "activate", 0.8)

    harness = ClosedLoopSimulationHarness(scenario, [atlas, reviewer])
    result = harness.run(max_ticks=3)

    assert result.metrics.task_outcomes[task.id] == "completed"
    assert result.metrics.consensus_iterations[task.id] == 1
    assert result.metrics.escalations == []
    consensus_events = [event for event in result.events if event.category == "consensus"]
    assert consensus_events, "Expected at least one consensus event"
    assert consensus_events[0].metadata["support"] >= task.quorum


def test_closed_loop_harness_applies_feedback_and_recovers_from_failure() -> None:
    task = SimulationTask(
        id="deploy-weather-loop",
        description="Deploy closed-loop orchestration after dependency fix",
        target_action="deploy",
        required_capabilities={"analysis", "execution"},
        quorum=1.6,
        max_attempts=3,
    )

    def cautious_policy(snapshot):
        if snapshot.active_task is None:
            return None
        action = "deploy" if snapshot.signals.get("enable_deploy") else "pause"
        confidence = 0.85 if action == "deploy" else 0.6
        return AgentDecision(
            agent_id="atlas",
            task_id=snapshot.active_task.id,
            action=action,
            confidence=confidence,
            rationale="Waiting for ops acknowledgement" if action == "pause" else "Ops cleared the risk",
        )

    def reviewer_policy(snapshot):
        if snapshot.active_task is None:
            return None
        if snapshot.signals.get("enable_deploy"):
            return AgentDecision(
                agent_id="researcher",
                task_id=snapshot.active_task.id,
                action="deploy",
                confidence=0.8,
                rationale="Telemetry stable",
            )
        return AgentDecision(
            agent_id="researcher",
            task_id=snapshot.active_task.id,
            action="pause",
            confidence=0.5,
            rationale="Need quorum evidence",
        )

    def feedback_hook(snapshot, decisions: Sequence[AgentDecision], evaluation) -> Iterable[FeedbackSignal]:
        if not evaluation.satisfied and evaluation.attempts == 1:
            yield FeedbackSignal(
                name="enable_deploy",
                value=True,
                message="Director Dana approved deployment after guardrail inspection",
            )

    scenario = SimulationScenario(
        name="Deployment with guardrail feedback",
        tasks=[task],
        feedback_hooks=[feedback_hook],
    )

    atlas = SimulationAgent(agent_id="atlas", capabilities={"analysis", "execution"}, policy=cautious_policy)
    researcher = SimulationAgent(agent_id="researcher", capabilities={"analysis", "execution"}, policy=reviewer_policy)

    harness = ClosedLoopSimulationHarness(scenario, [atlas, researcher])
    result = harness.run(max_ticks=4)

    assert result.metrics.task_outcomes[task.id] == "completed"
    assert result.metrics.feedback_events == 1
    assert result.signals["enable_deploy"] is True

    consensus_events = [event for event in result.events if event.category == "consensus"]
    assert len(consensus_events) >= 2
    # First attempt should fail due to pause actions, second should succeed.
    assert consensus_events[0].metadata["winning_action"] == "pause"
    assert consensus_events[0].detail == "Consensus failed"
    assert consensus_events[1].metadata["winning_action"] == "deploy"
    assert consensus_events[1].detail == "Consensus satisfied"
