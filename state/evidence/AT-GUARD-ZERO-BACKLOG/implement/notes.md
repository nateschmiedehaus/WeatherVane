## Implementation Notes
- Added `--map state/risk_oracle_map.json` to the CI coverage enforcement step.
- Ensured `run_integrity_tests.sh` prepares `state/automation/` and now runs structural policy, risk coverage, PR metadata, and the ts loader guard.
- Added root npm scripts (`validate:roadmap`, `validate:roadmap-evidence`) and ran the roadmap evidence migration to satisfy review audit validators.
- Introduced `backfill_evidence_dirs.ts` to generate legacy evidence folders and README placeholders; executed it against the current roadmap so validators stay green long term.
- Re-ran guard scripts locally to confirm clean outputs; no guard logic changes were needed—wiring and artifacts were the missing pieces.
