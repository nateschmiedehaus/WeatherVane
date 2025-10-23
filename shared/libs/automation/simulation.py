"""Closed-loop simulation harness for autonomous team orchestration.

The harness models a backlog of automation tasks that require consensus across
multiple agents. Each simulation tick feeds the current state into every agent,
collects their decisions, evaluates whether quorum is satisfied, then applies
feedback hooks that can adjust the shared signals before the next tick. This
allows product engineers to prototype new orchestration policies and validate
that guardrails fire before shipping changes into the live autopilot loops.

The design intentionally keeps the surface area lightweight so tests can supply
simple callables, yet the core mechanics mirror the real-world flow:

1. Backlog prioritisation selects the active task.
2. Eligible agents emit actions with confidence scores.
3. Consensus evaluation tallies support for each action.
4. Feedback hooks close the loop by mutating signals or generating incidents.

Usage example (see: ``tests/shared/libs/test_autonomous_simulation.py``):

>>> scenario = SimulationScenario(
...     name="Weather guardrail replay",
...     tasks=[SimulationTask(
...         id="guardrail-restore",
...         description="Re-run guardrail after reviewer feedback",
...         target_action="rerun",
...         required_capabilities={"analysis", "execution"},
...         quorum=1.5,
...     )],
... )
>>> support_agent = SimulationAgent(
...     agent_id="atlas",
...     capabilities={"analysis", "execution"},
...     policy=lambda ctx: AgentDecision(
...         agent_id="atlas",
...         task_id=ctx.active_task.id,
...         action="rerun",
...         confidence=0.9,
...         rationale="Prior incident requires verification",
...     ),
... )
>>> harness = ClosedLoopSimulationHarness(scenario, [support_agent])
>>> result = harness.run(max_ticks=3)
>>> result.metrics.task_outcomes["guardrail-restore"]
'completed'

The harness is deterministic and side-effect free, making it suitable for unit
tests, product simulations, or future experimentation notebooks.
"""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Callable, Deque, Dict, Iterable, List, Mapping, MutableMapping, Optional, Protocol, Sequence


# -- Data model ----------------------------------------------------------------


@dataclass(slots=True)
class SimulationTask:
    """Task that autonomous agents will attempt to complete during the run."""

    id: str
    description: str
    target_action: str
    required_capabilities: frozenset[str] | set[str]
    quorum: float = 2.0
    max_attempts: int = 3

    def requires(self, capabilities: frozenset[str]) -> bool:
        """Return True when the agent's capabilities cover this task."""

        return self.required_capabilities.issubset(capabilities)


@dataclass(slots=True)
class AgentDecision:
    """Decision emitted by an agent for the active task."""

    agent_id: str
    task_id: str
    action: str
    confidence: float
    rationale: str = ""

    def clamp(self) -> "AgentDecision":
        """Ensure confidence stays within the [0, 1] range."""

        confidence = max(0.0, min(1.0, self.confidence))
        if confidence == self.confidence:
            return self
        return AgentDecision(
            agent_id=self.agent_id,
            task_id=self.task_id,
            action=self.action,
            confidence=confidence,
            rationale=self.rationale,
        )


@dataclass(slots=True)
class FeedbackSignal:
    """Feedback applied after consensus evaluation to keep the loop closed."""

    name: str
    value: float | int | str | bool
    message: str


@dataclass(slots=True)
class SimulationEvent:
    """Timeline entry describing notable steps in the simulation."""

    tick: int
    task_id: str
    category: str
    detail: str
    metadata: Mapping[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class SimulationSnapshot:
    """Snapshot shared with policies when requesting decisions."""

    tick: int
    active_task: SimulationTask | None
    backlog: tuple[str, ...]
    signals: Mapping[str, object]
    attempts_remaining: Mapping[str, int]
    previous_event: SimulationEvent | None


@dataclass(slots=True)
class ConsensusEvaluation:
    """Result after tallying decisions for the active task."""

    satisfied: bool
    winning_action: str | None
    support: float
    attempts: int


FeedbackHook = Callable[[SimulationSnapshot, Sequence[AgentDecision], ConsensusEvaluation], Iterable[FeedbackSignal]]


class SimulationPolicy(Protocol):
    """Callable interface for agent decision making."""

    def __call__(self, snapshot: SimulationSnapshot) -> AgentDecision | None:
        ...


@dataclass(slots=True)
class SimulationAgent:
    """Agent participating in the simulation."""

    agent_id: str
    capabilities: frozenset[str] | set[str]
    policy: SimulationPolicy

    def decide(self, snapshot: SimulationSnapshot) -> AgentDecision | None:
        task = snapshot.active_task
        if task is None:
            return None

        capabilities = frozenset(self.capabilities)
        if not task.requires(capabilities):
            return None

        decision = self.policy(snapshot)
        if decision is None or decision.task_id != task.id:
            return None
        return decision.clamp()


@dataclass(slots=True)
class SimulationScenario:
    """Scenario definition including tasks and feedback hooks."""

    name: str
    tasks: Sequence[SimulationTask]
    feedback_hooks: Sequence[FeedbackHook] = ()


@dataclass(slots=True)
class SimulationMetrics:
    """Aggregated metrics at the end of the run."""

    ticks: int = 0
    consensus_iterations: MutableMapping[str, int] = field(default_factory=dict)
    escalations: List[str] = field(default_factory=list)
    task_outcomes: MutableMapping[str, str] = field(default_factory=dict)
    feedback_events: int = 0


@dataclass(slots=True)
class SimulationResult:
    """Result returned after ``ClosedLoopSimulationHarness.run``."""

    scenario: SimulationScenario
    metrics: SimulationMetrics
    events: Sequence[SimulationEvent]
    signals: Mapping[str, object]


# -- Harness -------------------------------------------------------------------


class ClosedLoopSimulationHarness:
    """Run closed-loop consensus simulations across autonomous agents."""

    def __init__(self, scenario: SimulationScenario, agents: Sequence[SimulationAgent], *, signals: Optional[Mapping[str, object]] = None) -> None:
        if not scenario.tasks:
            raise ValueError("Simulation scenario must include at least one task")
        if not agents:
            raise ValueError("Simulation harness requires at least one agent")

        self._scenario = scenario
        self._agents = list(agents)
        self._signals: Dict[str, object] = dict(signals or {})

    def run(self, *, max_ticks: int = 20) -> SimulationResult:
        if max_ticks <= 0:
            raise ValueError("max_ticks must be positive")

        backlog: Deque[SimulationTask] = deque(self._scenario.tasks)
        attempts: Dict[str, int] = {task.id: 0 for task in backlog}
        metrics = SimulationMetrics()
        events: List[SimulationEvent] = []
        previous_event: SimulationEvent | None = None

        for tick in range(1, max_ticks + 1):
            if not backlog:
                break

            metrics.ticks += 1
            task = backlog[0]
            metrics.consensus_iterations.setdefault(task.id, 0)
            metrics.consensus_iterations[task.id] += 1

            snapshot = SimulationSnapshot(
                tick=tick,
                active_task=task,
                backlog=tuple(t.id for t in backlog),
                signals=self._signals.copy(),
                attempts_remaining={
                    task_id: max(0, queued_task.max_attempts - attempts[task_id])
                    for task_id, queued_task in ((queued.id, queued) for queued in backlog)
                },
                previous_event=previous_event,
            )

            decisions: List[AgentDecision] = []
            for agent in self._agents:
                decision = agent.decide(snapshot)
                if decision is not None:
                    decisions.append(decision)

            if not decisions:
                event = SimulationEvent(
                    tick=tick,
                    task_id=task.id,
                    category="idle",
                    detail="No eligible agents produced a decision",
                    metadata={"signals": dict(self._signals)},
                )
                events.append(event)
                previous_event = event
                self._apply_feedback(snapshot, [], ConsensusEvaluation(False, None, 0.0, attempts[task.id]), metrics, events)
                attempts[task.id] += 1
                if attempts[task.id] >= task.max_attempts:
                    self._escalate(task, attempts[task.id], events, metrics, tick)
                    backlog.popleft()
                continue

            support_counter = Counter()
            for decision in decisions:
                support_counter[decision.action] += decision.confidence

            if support_counter:
                winning_action, winning_support = support_counter.most_common(1)[0]
            else:
                winning_action, winning_support = None, 0.0

            satisfied = winning_action == task.target_action and winning_support >= task.quorum
            consensus_event = SimulationEvent(
                tick=tick,
                task_id=task.id,
                category="consensus",
                detail=(
                    "Consensus satisfied" if satisfied else "Consensus failed"
                ),
                metadata={
                    "winning_action": winning_action,
                    "support": winning_support,
                    "expected_action": task.target_action,
                    "decisions": [
                        {
                            "agent_id": decision.agent_id,
                            "task_id": decision.task_id,
                            "action": decision.action,
                            "confidence": decision.confidence,
                            "rationale": decision.rationale,
                        }
                        for decision in decisions
                    ],
                },
            )
            events.append(consensus_event)
            previous_event = consensus_event

            evaluation = ConsensusEvaluation(
                satisfied=satisfied,
                winning_action=winning_action,
                support=winning_support,
                attempts=attempts[task.id] + 1,
            )
            self._apply_feedback(snapshot, decisions, evaluation, metrics, events)

            if satisfied:
                metrics.task_outcomes[task.id] = "completed"
                backlog.popleft()
                attempts.pop(task.id, None)
                continue

            attempts[task.id] += 1
            if attempts[task.id] >= task.max_attempts:
                self._escalate(task, attempts[task.id], events, metrics, tick)
                backlog.popleft()
                attempts.pop(task.id, None)
            else:
                backlog.rotate(-1)

        # Mark remaining tasks as unfinished to aid debugging.
        for remaining in backlog:
            metrics.task_outcomes.setdefault(remaining.id, "incomplete")

        return SimulationResult(
            scenario=self._scenario,
            metrics=metrics,
            events=tuple(events),
            signals=dict(self._signals),
        )

    # -- Internal helpers --------------------------------------------------

    def _apply_feedback(
        self,
        snapshot: SimulationSnapshot,
        decisions: Sequence[AgentDecision],
        evaluation: ConsensusEvaluation,
        metrics: SimulationMetrics,
        events: List[SimulationEvent],
    ) -> None:
        if not self._scenario.feedback_hooks:
            return

        applied: List[FeedbackSignal] = []
        for hook in self._scenario.feedback_hooks:
            for signal in hook(snapshot, decisions, evaluation):
                self._signals[signal.name] = signal.value
                applied.append(signal)

        if not applied:
            return

        metrics.feedback_events += len(applied)
        event = SimulationEvent(
            tick=snapshot.tick,
            task_id=snapshot.active_task.id if snapshot.active_task else "",
            category="feedback",
            detail="Applied feedback signals",
            metadata={
                "signals": [
                    {
                        "name": signal.name,
                        "value": signal.value,
                        "message": signal.message,
                    }
                    for signal in applied
                ],
            },
        )
        events.append(event)

    def _escalate(
        self,
        task: SimulationTask,
        attempts: int,
        events: List[SimulationEvent],
        metrics: SimulationMetrics,
        tick: int,
    ) -> None:
        metrics.escalations.append(task.id)
        metrics.task_outcomes[task.id] = "escalated"
        event = SimulationEvent(
            tick=tick,
            task_id=task.id,
            category="escalation",
            detail="Max attempts exceeded; escalating to Director Dana",
            metadata={
                "attempts": attempts,
                "target_action": task.target_action,
            },
        )
        events.append(event)
