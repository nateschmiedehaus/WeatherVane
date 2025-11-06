# Implementation Notes

- Updated `PatternMiningClient.findPatterns` to emit `PatternInsight` objects with `source: 'stub'`, placeholder tags/evidence, and metadata, satisfying the required interface while signalling stub status.
- Hardened `ResearchOrchestrator.composeContent` so alternative confidence values fall back to `normalizeConfidence(alternative.confidence ?? 0.6)` before formatting, eliminating the optional access warning.
