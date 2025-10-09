"""Context warning evaluation utilities for data-context driven guardrails."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class WarningRule:
    """Single rule mapping a context tag pattern to a warning message/severity."""

    match: str
    message: str
    severity: str = "warning"
    escalate_for_automation: bool = False

    def applies_to(self, tag: str) -> bool:
        """Return True when the rule should trigger for the provided tag."""

        pattern = self.match
        if pattern.endswith(".*"):
            prefix = pattern[:-2]
            return tag.startswith(prefix)
        return tag == pattern


@dataclass(frozen=True)
class WarningPayload:
    """Result of evaluating a rule against a data-context tag."""

    code: str
    message: str
    severity: str
    tags: tuple[str, ...]


class ContextWarningEngine:
    """Derives operator-facing warnings from context tags and policy state."""

    def __init__(self, rules: Sequence[WarningRule]) -> None:
        self._rules = tuple(rules)

    @property
    def rules(self) -> tuple[WarningRule, ...]:
        """Return the immutable sequence of rules backing this engine."""

        return self._rules

    def evaluate(
        self,
        tags: Iterable[str],
        *,
        autopilot_enabled: bool,
        pushes_enabled: bool,
    ) -> list[WarningPayload]:
        """Return a set of warnings for the provided tags and automation context."""

        warnings: list[WarningPayload] = []
        tag_list = list(tags)
        for tag in tag_list:
            rule = self._matching_rule(tag)
            if not rule:
                continue
            severity = rule.severity
            if rule.escalate_for_automation and (autopilot_enabled or pushes_enabled):
                severity = "critical"
            message = self._render_message(rule, tag)
            warnings.append(
                WarningPayload(
                    code=tag.replace(".", "_"),
                    message=message,
                    severity=severity,
                    tags=(tag,),
                )
            )
        return warnings

    @classmethod
    def from_overrides(
        cls,
        base: "ContextWarningEngine",
        overrides: Sequence[Mapping[str, object]],
    ) -> "ContextWarningEngine":
        """Return an engine that merges overrides with the base rules.

        Overrides replace rules with matching ``match`` keys and can create new entries.
        Missing fields inherit values from the base rule when present.
        """

        combined = _merge_rules(base.rules, overrides)
        return cls(combined)

    def _matching_rule(self, tag: str) -> WarningRule | None:
        for rule in self._rules:
            if rule.applies_to(tag):
                return rule
        return None

    @staticmethod
    def _render_message(rule: WarningRule, tag: str) -> str:
        if "{dataset}" in rule.message:
            dataset = tag.split(".")[-1]
            return rule.message.format(dataset=dataset.replace("_", " ").title())
        return rule.message


DEFAULT_WARNING_RULES: tuple[WarningRule, ...] = (
    WarningRule(
        match="history.missing_orders",
        severity="critical",
        message="Order history is missing; keep automation in manual until ingestion resumes.",
    ),
    WarningRule(
        match="history.short",
        severity="warning",
        message="Order history is short; Autopilot should stay in assist while coverage improves.",
        escalate_for_automation=True,
    ),
    WarningRule(
        match="ads.missing",
        severity="critical",
        message="Ads performance is unavailable; guardrail checks fall back to defaults. Avoid Autopilot pushes.",
    ),
    WarningRule(
        match="ads.sparse",
        severity="warning",
        message="Ads performance is sparse; Autopilot will throttle pushes and request manual review.",
        escalate_for_automation=True,
    ),
    WarningRule(
        match="weather.missing",
        severity="critical",
        message="Weather feed is missing; weather-aware allocations are disabled until data stabilises.",
    ),
    WarningRule(
        match="weather.stubbed",
        severity="warning",
        message="Weather feed is stubbed; recommendations are downgraded—treat automation changes with caution.",
        escalate_for_automation=True,
    ),
    WarningRule(
        match="nulls.high.*",
        severity="warning",
        message="High null ratio detected in {dataset}; guardrail monitors may misfire until cleaned.",
    ),
)


default_warning_engine = ContextWarningEngine(DEFAULT_WARNING_RULES)


def _merge_rules(
    defaults: Sequence[WarningRule],
    overrides: Sequence[Mapping[str, object]],
) -> list[WarningRule]:
    """Merge override mappings with default rules, preserving order."""

    merged: dict[str, WarningRule] = {rule.match: rule for rule in defaults}
    for raw in overrides:
        match_value = str(raw.get("match", "")).strip()
        if not match_value:
            continue
        base_rule = merged.get(match_value)
        message = str(
            raw.get("message")
            or (base_rule.message if base_rule else "Data context warning")
        )
        severity = str(
            raw.get("severity")
            or (base_rule.severity if base_rule else "warning")
        )
        escalate = raw.get("escalate_for_automation")
        if escalate is None:
            escalate = raw.get("escalate")
        if escalate is None and base_rule is not None:
            escalate = base_rule.escalate_for_automation
        escalate_bool = bool(escalate)
        merged[match_value] = WarningRule(
            match=match_value,
            message=message,
            severity=severity,
            escalate_for_automation=escalate_bool,
        )

    ordered_matches = {rule.match for rule in defaults}
    result: list[WarningRule] = [merged[rule.match] for rule in defaults]
    for match, rule in merged.items():
        if match not in ordered_matches:
            result.append(rule)
    return result
