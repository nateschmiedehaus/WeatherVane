## Plan
1. Audit existing guard outputs and confirm required artifact paths under `state/automation/`.
2. Patch CI workflow to pass `--map state/risk_oracle_map.json` to the coverage script.
3. Update integrity harness to run structural policy, risk coverage, PR metadata, and loader guard sequentially.
4. Execute guard scripts locally, collect outputs, and attach logs to Verify.
5. Re-run integrity harness (or targeted stages) to confirm zero failures.
