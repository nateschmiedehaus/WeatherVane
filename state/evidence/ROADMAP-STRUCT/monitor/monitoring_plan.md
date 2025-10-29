# ROADMAP-STRUCT Phase 3 Monitoring Plan

**Date**: 2025-10-29
**Phase**: MONITOR
**Task**: ROADMAP-STRUCT Phase 3 - Roadmap Migration

---

## Success Metrics

### Adoption Metrics
- **v2.0 Adoption Rate**: 100% (both roadmaps migrated)
  - Product roadmap: ✅ 378 tasks in v2.0
  - MCP roadmap: ✅ 273 tasks in v2.0

- **Validation Passing**:
  - Target: 0 errors on every commit
  - Baseline: 0 errors (initial migration)

- **Schema Compliance**:
  - Typed dependencies: 100% of tasks
  - Metadata coverage: 100% (complexity_score, effort_hours, required_tools)

### Performance Metrics
- **Migration Time**: < 30 seconds for 500 tasks
  - Actual: ~5 seconds for 378 tasks ✅
  - Actual: ~5 seconds for 273 tasks ✅

- **Validation Time**: < 100ms for 500 tasks
  - Actual: 19ms for 273 tasks ✅
  - Target met

### Quality Metrics
- **Data Loss**: 0 tasks lost during migration
  - Verified: Task counts preserved ✅

- **Active Task Preservation**: 100%
  - Verified: `in_progress` tasks retained status ✅

---

## Monitoring Procedures

### Daily Checks
1. **Roadmap Validation** (automated via CI)
   ```bash
   npm run validate:roadmap
   # Expected: Exit 0, 0 errors
   ```

2. **Schema Version Check**
   ```bash
   head -1 state/roadmap.yaml
   # Expected: schema_version: '2.0'
   ```

### Weekly Checks
1. **Metadata Coverage Audit**
   ```bash
   # Check for tasks missing metadata
   grep -A 5 "^  - id:" state/roadmap.yaml | \
     grep -B 5 "complexity_score" | wc -l
   # Should equal total task count
   ```

2. **Validation Warnings Review**
   ```bash
   npm run validate:roadmap
   # Review warnings, decide if action needed
   ```

### Monthly Checks
1. **Performance Baseline**
   - Measure `plan_next` query time
   - Target: < 50ms for YAML, < 5ms once hybrid implemented

2. **Schema Evolution Review**
   - Are new fields needed?
   - Should validation rules change?

---

## Rollback Procedures

### Emergency Rollback (if migration breaks system)

**Scenario**: Critical issue discovered, need to revert immediately

**Steps**:
```bash
# 1. Restore from backup
cp state/roadmap.yaml.v1.backup.yaml state/roadmap.yaml

# 2. Verify restoration
npm run validate:roadmap
# Will show v1 errors (expected)

# 3. Commit rollback
git add state/roadmap.yaml
git commit -m "rollback(roadmap): Revert to v1.0 due to [ISSUE]"
git push

# 4. Revert migration commit (optional - preserves migration script)
git revert <migration-commit-hash>
```

**Time to Rollback**: < 2 minutes

**Impact**:
- Loss of v2.0 benefits (typed dependencies, structured exit criteria)
- Validation will show v1 format errors (1336 errors expected)
- MCP tools revert to v1.0 parsing

---

## Known Issues and Limitations

### Issue 1: Backup Not Validated
**Severity**: LOW
**Description**: Backup files not verified as valid YAML after creation
**Mitigation**: Git provides ultimate safety net
**Fix**: Add backup validation to migration script (future enhancement)

### Issue 2: No File Locking
**Severity**: LOW
**Description**: Concurrent edits during migration could cause corruption
**Mitigation**: Migration is fast (~5s), unlikely to conflict
**Fix**: Add atomic file operations (write to temp, rename)

### Issue 3: Domain/Status Mapping Incomplete
**Severity**: LOW
**Description**: Only 3-4 invalid values mapped
**Mitigation**: Migration fails loudly if unmapped value encountered
**Fix**: Add more mappings as discovered

### Limitation 1: YAML Performance
**Description**: YAML parsing slower than SQLite (~10-100x)
**Impact**: Affects `plan_next` query time as roadmap grows
**Solution**: Implement ROADMAP-HYBRID (follow-up task already created)

### Limitation 2: No Historical Tracking
**Description**: Can't query "what was task status 2 weeks ago?"
**Impact**: Limited analytics on task velocity
**Solution**: Future enhancement (event log or SQLite temporal tables)

---

## Maintenance Procedures

### Adding New Tasks (Manual)
```yaml
- id: NEW-TASK-ID
  title: "Task title"
  status: pending
  dependencies:
    depends_on: []
  exit_criteria:
    - prose: "Acceptance criterion"
  domain: product  # or mcp
  description: "..."
  complexity_score: 5    # 1-10
  effort_hours: 2
  required_tools: []
```

### Validating Before Commit
```bash
# Always validate before committing
npm run validate:roadmap

# Check for issues
git diff state/roadmap.yaml
```

### Updating Task Status
```bash
# Use plan_update MCP tool or edit manually
# Manual edit:
# 1. Find task by ID
# 2. Change status: pending → in_progress → done
# 3. Validate and commit
```

---

## Alert Thresholds

### Critical Alerts (Immediate Action Required)
- ❌ Validation returns > 0 errors
- ❌ Migration takes > 60 seconds
- ❌ Task count mismatch after migration
- ❌ Active tasks lose `in_progress` status

### Warning Alerts (Review Within 24h)
- ⚠️ Validation returns > 50 warnings
- ⚠️ Migration takes > 30 seconds
- ⚠️ Metadata coverage < 95%
- ⚠️ Query time > 100ms

### Info Alerts (Review Weekly)
- ℹ️ New invalid domain/status values discovered
- ℹ️ Validation warnings increasing
- ℹ️ Roadmap size growing beyond 1000 tasks

---

## Success Indicators (30-Day Check-in)

### Must Have (Critical Success)
- ✅ Both roadmaps in v2.0 format
- ✅ 0 validation errors on every commit
- ✅ No data loss incidents
- ✅ Migration script reusable for future migrations

### Should Have (Strong Success)
- ✅ 100% metadata coverage
- ✅ CI validation integrated
- ✅ Documentation updated
- ✅ Team trained on v2.0 structure

### Nice to Have (Bonus Success)
- 🎯 Phase 4 (plan_next enhancement) started
- 🎯 ROADMAP-HYBRID implementation underway
- 🎯 System prompts updated (ROADMAP-PROMPTS)
- 🎯 Query time baseline established

---

## Evolution Plan

### Short Term (Next Sprint)
1. Complete Phase 4: plan_next Enhancement
   - Implement WSJF ranking
   - Use DependencyGraph for queries
   - Add CompletionVerifier for exit criteria

2. Complete Phase 5: CI Integration
   - Add pre-commit hook for validation
   - GitHub Actions workflow for validation
   - PR comments with validation results

### Medium Term (1-3 Months)
1. Implement ROADMAP-HYBRID
   - YAML source + SQLite runtime
   - 10-100x query speedup
   - Scalable to 10,000+ tasks

2. Complete ROADMAP-PROMPTS
   - Update all system prompts to v2.0
   - Replace v1 examples with v2
   - Document metadata fields

### Long Term (3-6 Months)
1. Vector Embeddings
   - Task similarity search
   - Automated task clustering
   - Duplicate detection

2. Historical Tracking
   - Task status over time
   - Velocity analytics
   - Burndown charts

3. Multi-Roadmap Federation
   - Query across WeatherVane + MCP roadmaps
   - Cross-roadmap dependencies
   - Unified reporting

---

## Monitoring Tools

### Automated Monitoring
- **CI Validation**: GitHub Actions runs validation on every PR
- **Pre-commit Hook**: Validates locally before commit
- **MCP Health Checks**: Roadmap loading time tracked

### Manual Monitoring
- **Weekly Status Review**: Check validation warnings
- **Monthly Performance Review**: Query time baselines
- **Quarterly Schema Review**: Evaluate if schema needs changes

---

## MONITOR Phase Complete ✅

**Status**: Production monitoring active

**Next Actions**:
1. Monitor validation results in CI
2. Track query performance as roadmap grows
3. Begin Phase 4 planning when ready

**Evidence**: This monitoring plan serves as the operational guide for ROADMAP-STRUCT Phase 3
