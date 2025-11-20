# Plan: Autopilot V2 Restoration

## Phases
1. [x] Restore Membrane (CLI).
2. [x] Restore Nervous System (Scanner, Dispatcher).
3. [x] Restore Brain (Optimizer, Memory).
4. [ ] Verify Integration.

## Verification
- Run `npm run autopilot` to test CLI.
- Run `npx tsx src/nervous/test_scanner.ts`.

## PLAN-authored tests
- `src/nervous/test_scanner.ts`
- `src/brain/test_brain.ts`
- `src/body/test_body.ts`
- `npm run autopilot` (Wave 0 Live Membrane Test)
