# Pre-Mortem — FIX-TEST-QualityIntegration

## Failure Scenarios

1. **Script helpers produce wrong output format**
   - Mitigation: Inspect actual implementation's expected JSON schema, match exactly.

2. **Mode logic implementation differs from tests**
   - Mitigation: Read `shouldBlockTransition()` before making changes.

3. **Fixing tests breaks other tests**
   - Mitigation: Run full suite after each fix.

4. **Coverage still <80% after fixes**
   - Mitigation: Check coverage report, add missing test cases.

5. **Flaky tests due to timing issues**
   - Mitigation: Use deterministic timeouts, clean up processes reliably.

## Risk Level: LOW
Tests exist, failures are known, implementation is stable. This is primarily test maintenance work.
