# Review: AFP-MODULE-REMEDIATION-20251105-C

- Restored feature gating (prompt, sandbox, scheduler, research toggles) with typed facade + snapshot utility; all dependent modules/tests updated accordingly.
- Introduced a lightweight `AuthChecker` so runtime/worker tools can surface authentication guidance without crashes.
- Removed brittle `.js` shims by standardizing on extensionless imports; usage estimator references now resolve cleanly.
- Remaining TypeScript errors relate to yet-unrestored executor modules (`command_runner`) slated for follow-up work.
