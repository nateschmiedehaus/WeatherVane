/**
 * Quality Framework - Embeds world-class quality standards into autonomous operation
 *
 * Philosophy: The system should intrinsically understand and pursue excellence
 * across code, architecture, UX, communication, and scientific rigor.
 */

import { logInfo } from "../telemetry/logger.js";

export type QualityDimension =
  | "code_elegance"
  | "architecture_design"
  | "user_experience"
  | "communication_clarity"
  | "scientific_rigor"
  | "performance_efficiency"
  | "maintainability"
  | "security_robustness"
  | "documentation_quality"
  | "testing_coverage";

export interface QualityStandard {
  dimension: QualityDimension;
  description: string;
  principles: string[];
  anti_patterns: string[];
  assessment_criteria: string[];
  target_score: number; // 0-100
}

export interface QualityAssessment {
  dimension: QualityDimension;
  score: number;
  strengths: string[];
  improvements: string[];
  recommendation: string;
}

export interface ComprehensiveQualityReport {
  overall_score: number;
  dimension_scores: Record<QualityDimension, number>;
  assessments: QualityAssessment[];
  world_class_areas: string[];
  needs_attention: string[];
  next_actions: string[];
}

export class QualityFramework {
  private standards: Map<QualityDimension, QualityStandard> = new Map();

  constructor() {
    this.initializeStandards();
  }

  private initializeStandards() {
    // Code Elegance
    this.standards.set("code_elegance", {
      dimension: "code_elegance",
      description: "Code is clear, concise, and beautiful to read",
      principles: [
        "Clarity over cleverness",
        "Self-documenting names and structure",
        "Single Responsibility Principle",
        "DRY (Don't Repeat Yourself) where it aids clarity",
        "Appropriate abstractions (not too few, not too many)",
        "Consistent style and patterns",
        "Elegant error handling",
        "Minimal cognitive load",
      ],
      anti_patterns: [
        "God objects/functions",
        "Deep nesting (>3 levels)",
        "Magic numbers/strings",
        "Unclear variable names",
        "Copy-paste code",
        "Premature optimization",
        "Over-engineering",
      ],
      assessment_criteria: [
        "Can a new developer understand it in <5 min?",
        "Are names self-explanatory?",
        "Is the structure intuitive?",
        "Are there comments only where necessary?",
        "Does it follow established patterns?",
      ],
      target_score: 90,
    });

    // Architecture Design
    this.standards.set("architecture_design", {
      dimension: "architecture_design",
      description: "System architecture is scalable, maintainable, and elegant",
      principles: [
        "Loose coupling, high cohesion",
        "Clear separation of concerns",
        "Dependency inversion",
        "Explicit interfaces",
        "Scalability by design",
        "Fail-fast error handling",
        "Observable and debuggable",
        "Minimize state complexity",
      ],
      anti_patterns: [
        "Tight coupling",
        "Hidden dependencies",
        "Circular dependencies",
        "God classes",
        "Leaky abstractions",
        "Hard-coded configuration",
        "Silent failures",
      ],
      assessment_criteria: [
        "Can components be tested independently?",
        "Is the data flow clear?",
        "Are boundaries well-defined?",
        "Can it scale horizontally?",
        "Is state management explicit?",
      ],
      target_score: 90,
    });

    // User Experience
    this.standards.set("user_experience", {
      dimension: "user_experience",
      description: "Interactions are intuitive, helpful, and delightful",
      principles: [
        "Progressive disclosure (show what's needed)",
        "Clear feedback (success/error states)",
        "Helpful error messages (actionable guidance)",
        "Consistent patterns",
        "Fast response times",
        "Graceful degradation",
        "Self-documenting interfaces",
        "Anticipate user needs",
      ],
      anti_patterns: [
        "Cryptic error messages",
        "Inconsistent behavior",
        "Hidden functionality",
        "No feedback on actions",
        "Overwhelming information dumps",
        "Unclear next steps",
        "Breaking changes without guidance",
      ],
      assessment_criteria: [
        "Can users discover features naturally?",
        "Do errors guide toward solutions?",
        "Is feedback immediate and clear?",
        "Are patterns consistent?",
        "Do users feel empowered?",
      ],
      target_score: 95,
    });

    // Communication Clarity
    this.standards.set("communication_clarity", {
      dimension: "communication_clarity",
      description: "All communication is precise, concise, and accessible",
      principles: [
        "Say it once, say it well",
        "Active voice, present tense",
        "Specific over vague",
        "Examples over explanations",
        "Structure over prose",
        "Scannable formatting",
        "Appropriate detail level",
        "Clear calls-to-action",
      ],
      anti_patterns: [
        "Jargon without explanation",
        "Passive voice",
        "Verbose explanations",
        "Missing examples",
        "Walls of text",
        "Ambiguous instructions",
        "Assuming knowledge",
      ],
      assessment_criteria: [
        "Can someone understand in one reading?",
        "Are examples provided?",
        "Is it scannable?",
        "Is the next action clear?",
        "Does it respect user time?",
      ],
      target_score: 95,
    });

    // Scientific Rigor
    this.standards.set("scientific_rigor", {
      dimension: "scientific_rigor",
      description: "Claims are evidence-based, reproducible, and validated",
      principles: [
        "Data-driven decisions",
        "Reproducible results",
        "Statistical validity",
        "Documented assumptions",
        "Uncertainty quantification",
        "Falsifiable hypotheses",
        "Peer-reviewable methods",
        "Causal clarity",
      ],
      anti_patterns: [
        "Correlation = causation",
        "Cherry-picking data",
        "Undocumented assumptions",
        "Non-reproducible experiments",
        "Ignoring uncertainty",
        "P-hacking",
        "Missing baselines",
      ],
      assessment_criteria: [
        "Can results be reproduced?",
        "Are assumptions explicit?",
        "Is uncertainty quantified?",
        "Are methods documented?",
        "Is causality established?",
      ],
      target_score: 90,
    });

    // Performance Efficiency
    this.standards.set("performance_efficiency", {
      dimension: "performance_efficiency",
      description: "System uses resources optimally and responds quickly",
      principles: [
        "Measure before optimizing",
        "Optimize critical paths",
        "Cache appropriately",
        "Lazy loading where beneficial",
        "Async where possible",
        "Resource pooling",
        "Graceful degradation under load",
        "Known complexity characteristics",
      ],
      anti_patterns: [
        "Premature optimization",
        "N+1 queries",
        "Blocking operations",
        "Memory leaks",
        "Unbounded growth",
        "Synchronous where async needed",
        "No caching strategy",
      ],
      assessment_criteria: [
        "Are response times < 200ms for interactive ops?",
        "Does it scale linearly?",
        "Are bottlenecks identified?",
        "Is resource usage bounded?",
        "Are operations async where appropriate?",
      ],
      target_score: 85,
    });

    // Maintainability
    this.standards.set("maintainability", {
      dimension: "maintainability",
      description: "System is easy to understand, modify, and extend",
      principles: [
        "Clear module boundaries",
        "Comprehensive documentation",
        "Automated testing",
        "Version control best practices",
        "Change-friendly architecture",
        "Minimal technical debt",
        "Refactor continuously",
        "Explicit deprecation paths",
      ],
      anti_patterns: [
        "Undocumented code",
        "No tests",
        "Monolithic structure",
        "Accumulating tech debt",
        "Hard to modify",
        "Breaking changes without notice",
        "Complex build process",
      ],
      assessment_criteria: [
        "Can a feature be added in <1 day?",
        "Is the codebase well-tested?",
        "Is documentation current?",
        "Are changes isolated?",
        "Is refactoring safe?",
      ],
      target_score: 90,
    });

    // Security Robustness
    this.standards.set("security_robustness", {
      dimension: "security_robustness",
      description: "System is secure by design and resilient to threats",
      principles: [
        "Principle of least privilege",
        "Defense in depth",
        "Input validation everywhere",
        "Output encoding",
        "Secure defaults",
        "Explicit error handling",
        "Audit logging",
        "Regular security reviews",
      ],
      anti_patterns: [
        "Trusting user input",
        "Weak authentication",
        "Exposing secrets",
        "SQL injection vectors",
        "XSS vulnerabilities",
        "Missing rate limiting",
        "No audit trail",
      ],
      assessment_criteria: [
        "Is input validated?",
        "Are secrets protected?",
        "Is access controlled?",
        "Are operations audited?",
        "Are threats modeled?",
      ],
      target_score: 95,
    });

    // Documentation Quality
    this.standards.set("documentation_quality", {
      dimension: "documentation_quality",
      description: "Documentation is comprehensive, accurate, and helpful",
      principles: [
        "Start with why (not how)",
        "Examples before details",
        "Structure for scanning",
        "Keep it current",
        "Multiple perspectives (user, dev, ops)",
        "Visual aids where helpful",
        "Searchable and linkable",
        "Progressive depth",
      ],
      anti_patterns: [
        "Stale documentation",
        "Wall of text",
        "No examples",
        "Missing quickstart",
        "Jargon heavy",
        "No visuals",
        "Poor organization",
      ],
      assessment_criteria: [
        "Can someone get started in <5 min?",
        "Are examples provided?",
        "Is it up-to-date?",
        "Is it searchable?",
        "Does it answer common questions?",
      ],
      target_score: 90,
    });

    // Testing Coverage
    this.standards.set("testing_coverage", {
      dimension: "testing_coverage",
      description: "Tests are comprehensive, fast, and reliable",
      principles: [
        "Test behavior, not implementation",
        "Fast unit tests",
        "Critical path integration tests",
        "Property-based tests where applicable",
        "Clear test names",
        "Minimal test coupling",
        "Test in production (canaries)",
        "Fail-fast on failures",
      ],
      anti_patterns: [
        "Testing implementation details",
        "Slow tests",
        "Flaky tests",
        "No edge case coverage",
        "Over-mocking",
        "Integration tests as unit tests",
        "Ignoring test failures",
      ],
      assessment_criteria: [
        "Is coverage >85% for critical paths?",
        "Do tests run in <1 minute?",
        "Are tests reliable?",
        "Do tests document behavior?",
        "Are edge cases covered?",
      ],
      target_score: 85,
    });
  }

  /**
   * Get quality standard for a dimension
   */
  getStandard(dimension: QualityDimension): QualityStandard {
    const standard = this.standards.get(dimension);
    if (!standard) {
      throw new Error(`Unknown quality dimension: ${dimension}`);
    }
    return standard;
  }

  /**
   * Get all standards
   */
  getAllStandards(): QualityStandard[] {
    return Array.from(this.standards.values());
  }

  /**
   * Generate quality checklist for a task
   */
  generateChecklistForTask(taskType: string): string[] {
    const checklist: string[] = [];

    if (taskType.includes("code") || taskType.includes("implement")) {
      checklist.push("✓ Code is clear and self-documenting");
      checklist.push("✓ Functions are single-purpose");
      checklist.push("✓ Error handling is explicit");
      checklist.push("✓ Tests cover critical paths");
    }

    if (taskType.includes("api") || taskType.includes("interface")) {
      checklist.push("✓ API is consistent and intuitive");
      checklist.push("✓ Error messages are actionable");
      checklist.push("✓ Examples are provided");
      checklist.push("✓ Input validation is comprehensive");
    }

    if (taskType.includes("doc") || taskType.includes("write")) {
      checklist.push("✓ Structure is scannable");
      checklist.push("✓ Examples before details");
      checklist.push("✓ Clear calls-to-action");
      checklist.push("✓ Appropriate detail level");
    }

    if (taskType.includes("model") || taskType.includes("analysis")) {
      checklist.push("✓ Assumptions are documented");
      checklist.push("✓ Methods are reproducible");
      checklist.push("✓ Uncertainty is quantified");
      checklist.push("✓ Baselines are established");
    }

    if (taskType.includes("deploy") || taskType.includes("ship")) {
      checklist.push("✓ Tests passing");
      checklist.push("✓ Performance validated");
      checklist.push("✓ Security reviewed");
      checklist.push("✓ Rollback plan ready");
    }

    // Universal checks
    checklist.push("✓ Meets world-class quality bar");
    checklist.push("✓ No technical debt introduced");

    return checklist;
  }

  /**
   * Self-assessment prompt - guides agent to evaluate quality
   */
  generateSelfAssessmentPrompt(taskDescription: string): string {
    return `
Before marking this task complete, assess quality across these dimensions:

**Task**: ${taskDescription}

**Quality Self-Check**:
1. **Code Elegance**: Is the code clear, concise, and beautiful?
   - No magic numbers or unclear names
   - Appropriate abstractions
   - Self-documenting structure

2. **Architecture**: Is the design scalable and maintainable?
   - Loose coupling, clear boundaries
   - No circular dependencies
   - Observable and debuggable

3. **User Experience**: Is interaction intuitive and helpful?
   - Clear feedback on all operations
   - Actionable error messages
   - Consistent patterns

4. **Communication**: Is all text precise and accessible?
   - Examples provided where helpful
   - Scannable structure
   - Clear next actions

5. **Performance**: Are resources used optimally?
   - No obvious bottlenecks
   - Appropriate caching
   - Known complexity characteristics

**Target**: All dimensions at 85-95%

**Question**: Does this work meet world-class standards?
- If YES: Ship it
- If NO: Identify specific improvements needed

**Remember**: Excellence is non-negotiable. Ship world-class or iterate.
`.trim();
  }

  /**
   * Generate quality improvement recommendations
   */
  generateImprovementRecommendations(
    assessments: QualityAssessment[]
  ): string[] {
    const recommendations: string[] = [];

    const lowScores = assessments.filter((a) => a.score < 80);

    if (lowScores.length > 0) {
      recommendations.push(
        `⚠️  Priority: Address ${lowScores.length} dimensions scoring < 80%`
      );

      for (const assessment of lowScores) {
        recommendations.push(
          `  - ${assessment.dimension}: ${assessment.recommendation}`
        );
      }
    }

    const mediumScores = assessments.filter(
      (a) => a.score >= 80 && a.score < 90
    );
    if (mediumScores.length > 0) {
      recommendations.push(
        `📈 Enhancement: Polish ${mediumScores.length} dimensions at 80-90%`
      );
    }

    const worldClass = assessments.filter((a) => a.score >= 95);
    if (worldClass.length > 0) {
      recommendations.push(
        `✨ Maintain: ${worldClass.length} dimensions at world-class (95%+)`
      );
    }

    return recommendations;
  }

  /**
   * Get quality philosophy for embedding in prompts
   */
  getQualityPhilosophy(): string {
    return `
# Quality Philosophy

**Core Belief**: World-class work is the only acceptable standard.

**Principles**:
1. **Clarity over Cleverness**: Code should be obvious, not clever
2. **Users First**: Every interaction should feel effortless
3. **Evidence-Based**: Claims require data, methods require validation
4. **Performance Matters**: Fast is a feature
5. **Elegant Design**: Architecture should feel inevitable
6. **Comprehensive Testing**: Tests document behavior and prevent regressions
7. **Security by Default**: Safety first, always
8. **Documentation Excellence**: Docs are part of the product
9. **Maintainable Always**: Future developers are stakeholders
10. **Shipping Velocity**: High quality enables high speed

**Standard**: 85-95% across all dimensions

**Mindset**: "Would I be proud to show this to an expert?"

**Result**: Systems that are beautiful, reliable, and joy to use.
`.trim();
  }
}
