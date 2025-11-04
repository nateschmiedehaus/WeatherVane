
# Inline Evaluators & Review Gates

- **Defaults:** groundedness ≥0.70, relevance ≥0.80, completeness ≥0.75.
- **Gate:** run evaluators during Review; if any score < threshold ⇒ auto‑return to Implement with `EvalGateFail`.
- **Extend:** add domain‑specific evaluators (e.g., uses ComplexityRouter output), log rationale.
