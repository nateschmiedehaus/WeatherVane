## Monitor Notes — FIX-ERROR-QualityIntegration

- Keep the targeted Vitest suite in the CI matrix; it guards messaging and telemetry resilience.
- If quality scripts or logger behaviour changes, extend the tests rather than weakening assertions.
- Consider additional telemetry or log aggregation alerts for repeated ENOSPC events in production.
