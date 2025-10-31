# THINK — Edge Cases

1. **Docs drift from automation updates**
   - Future enforcement changes (e.g., new CLI flags) could make instructions stale.
   - *Mitigation*: Reference canonical scripts (`npm run enforcement:*`) and state artifacts instead of duplicating command details.

2. **Multiple audiences**
   - Agents vs operators might misinterpret responsibilities if docs overlap.
   - *Mitigation*: Clarify audience for each doc (CLAUDE.md = agent behaviour, README = operator usage, troubleshooting guide = everyone).

3. **Troubleshooting recursion**
   - Guide could point to scripts that themselves fail (e.g., enforcement CLI unavailable).
   - *Mitigation*: Include fallback instructions (manual env var changes, checking config files).

4. **Rollout status ambiguity**
   - If rollout phases revert (observe <- strict), docs must signal dynamic state.
   - *Mitigation*: Document how to check `enforcement:status` and audit logs rather than hardcoding “strict forever”.

5. **Policy violations**
   - Docs must still enforce no-defer policy; risk of implying quality checks can be skipped during incidents.
   - *Mitigation*: Explicitly restate zero-skip policy and tie troubleshooting steps to immediate remediation.
