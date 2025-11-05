# Plan – Task 11 MODULE-INDEX

1. **Recon & baseline**
   - Inventory existing OWNERS/module files via `find` to gauge gaps.
   - Draft module list (core directories + submodules requiring entries).

2. **Schema & templates**
   - Define TypeScript types + helper for module records.
   - Create generator script skeleton (load directories, read YAML, default values).

3. **Populate stewardship files (if missing)**
   - For each required directory lacking OWNERS/module.yaml, create minimal files per policy (stewards: Atlas/Council, ttl 90 days, last_review today).

4. **Implement generator**
   - Traverse modules, read metadata, compute next review date, gather dependencies from module.yaml (if any), produce `meta/module_index.yaml` sorted alphanumerically.

5. **Implement validator**
   - Validate YAML against schema (use Zod or manual checks).
   - Ensure dependencies reference existing IDs; check TTL.

6. **Testing & evidence**
   - Run generator + validator, capture outputs in verify folder.
   - Optionally run lint (expected to fail on legacy) and targeted tests if added.

7. **Documentation & follow-up**
   - Update implementation log, note outstanding work (Task 12). 
   - Ensure gate/think artifacts reflect actions taken.

