# Universal Quality Standards

All WeatherVane work must meet **85-95%** across 7 dimensions:

---

## 1. Code Elegance (85-95%)

**Principles:**
- Clear, self-documenting code
- Appropriate abstractions
- Minimal complexity (cyclomatic complexity <10)
- DRY principle applied
- Meaningful variable/function names
- Consistent formatting

**Anti-patterns:**
- God objects (classes with too many responsibilities)
- Deep nesting (>3 levels)
- Magic numbers (unexplained constants)
- Unclear variable names (e.g., `x`, `tmp`, `data`)
- Copy-paste code duplication
- Overly clever code (obscure one-liners)

**Measurement:**
- Code review feedback
- Cyclomatic complexity metrics
- Duplication analysis
- Readability scores

**Examples:**

❌ **Bad**:
```typescript
function p(d: any) {
  let r = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i].s === 'a' && d[i].v > 100) {
      r += d[i].v * 0.05;
    }
  }
  return r;
}
```

✅ **Good**:
```typescript
function calculateActiveDiscounts(orders: Order[]): number {
  const DISCOUNT_RATE = 0.05;
  const MIN_VALUE = 100;

  return orders
    .filter(order => order.status === 'active' && order.value > MIN_VALUE)
    .reduce((total, order) => total + order.value * DISCOUNT_RATE, 0);
}
```

---

## 2. Architecture Design (85-95%)

**Principles:**
- Separation of concerns
- Loose coupling, high cohesion
- Scalable patterns
- Testable design
- Clear module boundaries
- Single responsibility principle

**Anti-patterns:**
- Circular dependencies
- Tight coupling between layers
- Monolithic functions (>100 lines)
- Mixed concerns (business logic + UI + data access)
- Hard-coded configuration
- Global state abuse

**Measurement:**
- Dependency graphs
- Module coupling metrics
- Interface clarity
- Test isolation capability

**Architecture Guidelines:**
- **Layered**: Presentation → Business Logic → Data Access
- **Modular**: Each module has a single, well-defined purpose
- **Extensible**: New features don't require modifying existing code
- **Testable**: Components can be tested in isolation

---

## 3. User Experience (85-95%)

**Principles:**
- Intuitive workflows
- Clear error messages
- Responsive UI (<100ms perceived latency)
- Accessible (WCAG AA minimum)
- Consistent design language
- Progressive disclosure (show complexity gradually)

**Anti-patterns:**
- Cryptic error messages ("Error: 500")
- Slow UI (>1 second for common actions)
- Inconsistent button styles/placements
- Missing loading states
- No keyboard navigation
- Inaccessible color contrasts

**Measurement:**
- User testing feedback
- Performance metrics (Time to Interactive, First Contentful Paint)
- Accessibility audits (Lighthouse, axe)
- Error message clarity scores

**Error Message Quality:**

❌ **Bad**: "Error: null reference"
✅ **Good**: "Unable to load weather data. Please check your internet connection and try again."

---

## 4. Communication Clarity (85-95%)

**Principles:**
- Comprehensive documentation
- Clear commit messages
- Meaningful logs
- Transparent decisions
- Self-documenting code
- Updated READMEs

**Anti-patterns:**
- Missing documentation
- Vague commit messages ("fixed stuff")
- Debug logs in production
- Undocumented assumptions
- Outdated READMEs
- No change logs

**Measurement:**
- Documentation coverage
- Commit message quality
- Log usefulness during debugging
- Onboarding time for new developers

**Commit Message Standards:**

❌ **Bad**: "updates"
✅ **Good**: "feat(weather): Add Open-Meteo API integration with retry logic"

**Log Message Standards:**

❌ **Bad**: `console.log('here')`
✅ **Good**: `logInfo('Weather data fetched successfully', { location, temperature, timestamp })`

---

## 5. Scientific Rigor (85-95%)

**Principles:**
- Reproducible experiments
- Statistical validity
- Baseline comparisons
- Documented assumptions
- Version-controlled data splits
- Proper train/test/validation separation

**Anti-patterns:**
- Data leakage (test data in training)
- Cherry-picking results
- No baseline comparison
- Unreproducible experiments
- Missing random seeds
- P-hacking (running tests until significance)

**Measurement:**
- Experiment reproducibility
- Statistical significance tests
- Baseline performance deltas
- Data quality checks

**ML Standards:**
- R² ≥ 0.45 for baseline models
- Proper time-series cross-validation
- No future data leakage
- Document all hyperparameters
- Version all datasets

See [ML Quality Standards](/docs/ML_QUALITY_STANDARDS.md) for detailed requirements.

---

## 6. Performance Efficiency (85-95%)

**Principles:**
- O(n log n) or better for critical paths
- Resource-bounded (memory, CPU)
- Caching where appropriate
- Lazy loading for heavy operations
- Database query optimization
- Pagination for large datasets

**Anti-patterns:**
- N+1 query problems
- Loading entire datasets into memory
- Synchronous I/O on main thread
- No caching for expensive operations
- Infinite loops or unbounded recursion
- Memory leaks

**Measurement:**
- Time complexity analysis
- Memory profiling
- Load testing results
- Database query counts

**Performance Budgets:**
- API responses: <500ms (p95)
- UI interactions: <100ms (perceived)
- Page load: <2s (Time to Interactive)
- Memory: <500MB per process
- Database queries: <10 per request

---

## 7. Security Robustness (85-95%)

**Principles:**
- No secrets in code
- Input validation
- Least privilege
- Audit trails
- Encryption at rest and in transit
- Regular security audits

**Anti-patterns:**
- Hardcoded credentials
- SQL injection vulnerabilities
- XSS vulnerabilities
- Missing authentication
- Unencrypted sensitive data
- No rate limiting

**Measurement:**
- `npm audit` results (0 vulnerabilities)
- Security scan results
- Penetration testing findings
- Secrets scan results

**Security Checklist:**
- [ ] All secrets use environment variables or secret manager
- [ ] All user inputs are validated/sanitized
- [ ] Authentication required for sensitive endpoints
- [ ] Authorization checks on all data access
- [ ] Audit logs for sensitive operations
- [ ] Rate limiting on public APIs
- [ ] HTTPS enforced in production
- [ ] Dependencies regularly updated

See [Security Standards](/docs/agent_library/common/standards/security_standards.md) for detailed requirements.

---

## Scoring Rubric

Each dimension scored 0-100%:

- **90-100%**: Excellent - Best practices followed, no issues
- **85-89%**: Good - Minor improvements possible
- **75-84%**: Acceptable - Some issues need addressing
- **60-74%**: Poor - Significant issues present
- **<60%**: Failing - Does not meet standards

**Overall Score**: Average of all 7 dimensions

**Target**: 85-95% overall (world-class quality)

**Gate**: Below 85% triggers blocking review, must fix before release

---

## Quality Review Process

### Self-Review (Worker):
1. Run build, tests, audit
2. Check all 7 dimensions against standards
3. Score honestly (use rubric)
4. Fix issues until 85%+ overall

### Critic Review:
1. Run specialized checks (build, tests, security, etc.)
2. Score each dimension
3. Provide actionable feedback
4. Block if <85%, advisory if 85-89%, approve if 90%+

### Atlas Review (for complex work):
1. Architectural assessment
2. Long-term maintainability check
3. Strategic alignment
4. Final approval/rejection

---

## Continuous Improvement

Quality standards evolve based on:
- **Learnings from production issues**
- **Industry best practices**
- **Team feedback**
- **Tooling improvements**

**Review cadence**: Quarterly or after major incidents

**Ownership**: Atlas + Director Dana + Critic Corps

---

## Key References

- [Testing Standards](/docs/agent_library/common/standards/testing_standards.md)
- [Coding Standards](/docs/agent_library/common/standards/coding_standards.md)
- [Security Standards](/docs/agent_library/common/standards/security_standards.md)
- [ML Quality Standards](/docs/ML_QUALITY_STANDARDS.md)
- [Verification Loop](/docs/agent_library/common/concepts/verification_loop.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
**Next Review**: 2026-01-23
