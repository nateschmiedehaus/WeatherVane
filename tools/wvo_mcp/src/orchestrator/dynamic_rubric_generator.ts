/**
 * Dynamic Rubric Generator - Creates complexity-appropriate quality standards
 *
 * Purpose: Generate rubrics that guide agents WITHOUT limiting their autonomy
 *
 * Philosophy:
 * - Simple tasks → simpler rubrics (avoid over-specification)
 * - Complex tasks → detailed rubrics (provide clear guidance)
 * - Rubrics are SUPPORT, not constraints
 * - Agents can think outside the lines when needed
 * - Rubrics keep agents on track, not in a pigeonhole
 *
 * Complexity Levels:
 * - trivial: One-step, obvious work (e.g., "Update version in package.json")
 * - simple: Few steps, clear path (e.g., "Add validation to existing function")
 * - moderate: Multi-step, some ambiguity (e.g., "Refactor module for testability")
 * - complex: Many steps, trade-offs (e.g., "Design new architecture component")
 * - very_complex: Novel work, research needed (e.g., "Implement new ML algorithm")
 */

import type { Task } from './task_types.js';

/**
 * Complexity level for a task
 */
export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';

/**
 * Quality dimension to evaluate
 */
export type QualityDimension =
  | 'correctness'
  | 'completeness'
  | 'code_quality'
  | 'test_coverage'
  | 'documentation'
  | 'performance'
  | 'security'
  | 'maintainability'
  | 'user_experience'
  | 'edge_cases';

/**
 * Rubric item - One quality criterion
 */
export interface RubricItem {
  dimension: QualityDimension;
  description: string;
  required: boolean; // Must pass vs. nice-to-have
  guidance: string[]; // How to achieve this
  examples?: string[]; // Concrete examples
}

/**
 * Agent autonomy guidance
 */
export interface AutonomyGuidance {
  encourageCreativity: boolean; // Should agent think outside the box?
  allowDeviations: boolean; // Can agent deviate from rubric if justified?
  requireJustification: boolean; // Must agent justify deviations?
  suggestAlternatives: boolean; // Should agent propose better approaches?
}

/**
 * Complete rubric for a task
 */
export interface TaskRubric {
  taskId: string;
  complexity: ComplexityLevel;
  estimatedTime: number; // minutes
  items: RubricItem[];
  autonomy: AutonomyGuidance;
  coreMessage: string; // High-level goal
  flexibilityNote: string; // Reminder that rubric is guidance
}

/**
 * Dynamic Rubric Generator
 *
 * Creates task-appropriate quality standards that guide without limiting
 */
export class DynamicRubricGenerator {
  /**
   * Analyze task complexity
   */
  analyzeComplexity(task: Task): ComplexityLevel {
    const text = `${task.title} ${task.description ?? ''}`.toLowerCase();

    // Complexity signals
    const signals = {
      trivial: ['bump version', 'update constant', 'fix typo', 'rename variable'],
      simple: ['add validation', 'fix bug', 'update config', 'add test'],
      moderate: ['refactor', 'implement feature', 'optimize', 'migrate'],
      complex: ['design', 'architecture', 'integrate', 'build system'],
      veryComplex: ['research', 'novel', 'invent', 'discover', 'prove'],
    };

    // Check for complexity keywords
    if (signals.veryComplex.some(kw => text.includes(kw))) {
      return 'very_complex';
    }

    if (signals.complex.some(kw => text.includes(kw))) {
      return 'complex';
    }

    if (signals.moderate.some(kw => text.includes(kw))) {
      return 'moderate';
    }

    if (signals.simple.some(kw => text.includes(kw))) {
      return 'simple';
    }

    if (signals.trivial.some(kw => text.includes(kw))) {
      return 'trivial';
    }

    // Fallback: analyze task structure
    const estimatedHours = task.estimated_hours ?? 0;
    const exitCriteria = task.exit_criteria?.length ?? 0;
    const dependencies = task.dependencies?.length ?? 0;

    // Use heuristics
    if (estimatedHours < 0.5 && exitCriteria <= 1) {
      return 'trivial';
    }

    if (estimatedHours < 2 && exitCriteria <= 3 && dependencies <= 1) {
      return 'simple';
    }

    if (estimatedHours < 8 && exitCriteria <= 5) {
      return 'moderate';
    }

    if (estimatedHours < 16) {
      return 'complex';
    }

    return 'very_complex';
  }

  /**
   * Generate rubric for a task
   */
  generateRubric(task: Task): TaskRubric {
    const complexity = this.analyzeComplexity(task);
    const items = this.generateRubricItems(task, complexity);
    const autonomy = this.generateAutonomyGuidance(complexity);

    return {
      taskId: task.id,
      complexity,
      estimatedTime: this.estimateTime(task, complexity),
      items,
      autonomy,
      coreMessage: this.generateCoreMessage(task, complexity),
      flexibilityNote: this.generateFlexibilityNote(complexity),
    };
  }

  /**
   * Generate rubric items based on complexity
   */
  private generateRubricItems(task: Task, complexity: ComplexityLevel): RubricItem[] {
    const items: RubricItem[] = [];
    const text = `${task.title} ${task.description ?? ''}`.toLowerCase();

    // Always include correctness
    items.push({
      dimension: 'correctness',
      description: 'Implementation works as specified and passes all tests',
      required: true,
      guidance: [
        'Verify against exit criteria',
        'Test with realistic data',
        'Handle edge cases appropriately',
      ],
      examples: complexity === 'trivial' || complexity === 'simple'
        ? ['Basic test passes']
        : ['All unit tests pass', 'Integration tests pass', 'Manual verification successful'],
    });

    // Add completeness for non-trivial tasks
    if (complexity !== 'trivial') {
      items.push({
        dimension: 'completeness',
        description: 'All exit criteria met, no partial work',
        required: true,
        guidance: [
          'Review each exit criterion',
          'Ensure no TODOs or placeholders',
          'Verify all promised functionality exists',
        ],
      });
    }

    // Add code quality based on complexity
    if (complexity === 'moderate' || complexity === 'complex' || complexity === 'very_complex') {
      items.push({
        dimension: 'code_quality',
        description: 'Code is clean, readable, and follows project standards',
        required: complexity === 'complex' || complexity === 'very_complex',
        guidance: [
          'Use meaningful variable names',
          'Extract complex logic into functions',
          'Add comments for non-obvious decisions',
          'Follow existing patterns in codebase',
        ],
        examples: [
          'Functions are < 50 lines',
          'No deeply nested conditionals',
          'Clear separation of concerns',
        ],
      });
    }

    // Add test coverage based on complexity
    if (complexity !== 'trivial') {
      const required = complexity === 'complex' || complexity === 'very_complex';
      items.push({
        dimension: 'test_coverage',
        description: required
          ? 'Comprehensive test coverage including edge cases'
          : 'Basic test coverage for main functionality',
        required,
        guidance: required
          ? [
              'Unit tests for all functions',
              'Integration tests for workflows',
              'Edge case tests (null, empty, boundary)',
              'Error handling tests',
            ]
          : [
              'At least one test for main functionality',
              'Basic edge case coverage',
            ],
      });
    }

    // Add documentation based on complexity
    if (complexity === 'complex' || complexity === 'very_complex') {
      items.push({
        dimension: 'documentation',
        description: 'Clear documentation of design decisions and usage',
        required: complexity === 'very_complex',
        guidance: [
          'Document WHY, not just WHAT',
          'Explain non-obvious trade-offs',
          'Provide usage examples',
          'Update architecture docs if needed',
        ],
        examples: [
          'JSDoc for public APIs',
          'README section for new features',
          'Architecture decision records for major changes',
        ],
      });
    }

    // Add performance for specific tasks
    if (text.includes('performance') || text.includes('optimize') || text.includes('scale')) {
      items.push({
        dimension: 'performance',
        description: 'Performance meets requirements, no regressions',
        required: true,
        guidance: [
          'Benchmark before and after',
          'Test with realistic data volume',
          'Profile for bottlenecks',
          'Document performance characteristics',
        ],
      });
    }

    // Add security for relevant tasks
    if (text.includes('auth') || text.includes('api') || text.includes('input') || text.includes('security')) {
      items.push({
        dimension: 'security',
        description: 'Security best practices followed, no vulnerabilities',
        required: true,
        guidance: [
          'Validate all inputs',
          'Sanitize outputs',
          'Use parameterized queries',
          'Check for common vulnerabilities (SQL injection, XSS, etc.)',
        ],
      });
    }

    // Add UX for user-facing tasks
    if (text.includes('ui') || text.includes('ux') || text.includes('user') || text.includes('frontend')) {
      items.push({
        dimension: 'user_experience',
        description: 'User experience is intuitive and frictionless',
        required: complexity === 'complex' || complexity === 'very_complex',
        guidance: [
          'Test with realistic user flows',
          'Ensure error messages are clear',
          'Optimize for common use cases',
          'Consider accessibility',
        ],
      });
    }

    return items;
  }

  /**
   * Generate autonomy guidance based on complexity
   */
  private generateAutonomyGuidance(complexity: ComplexityLevel): AutonomyGuidance {
    switch (complexity) {
      case 'trivial':
        return {
          encourageCreativity: false,
          allowDeviations: false,
          requireJustification: false,
          suggestAlternatives: false,
        };

      case 'simple':
        return {
          encourageCreativity: false,
          allowDeviations: true,
          requireJustification: true,
          suggestAlternatives: true,
        };

      case 'moderate':
        return {
          encourageCreativity: true,
          allowDeviations: true,
          requireJustification: true,
          suggestAlternatives: true,
        };

      case 'complex':
        return {
          encourageCreativity: true,
          allowDeviations: true,
          requireJustification: true,
          suggestAlternatives: true,
        };

      case 'very_complex':
        return {
          encourageCreativity: true,
          allowDeviations: true,
          requireJustification: true,
          suggestAlternatives: true,
        };
    }
  }

  /**
   * Generate core message (high-level goal)
   */
  private generateCoreMessage(task: Task, complexity: ComplexityLevel): string {
    const messages = {
      trivial: 'Complete this straightforward task quickly and correctly.',
      simple: 'Implement this feature following existing patterns. Feel free to suggest improvements if you see better approaches.',
      moderate: 'Solve this problem thoughtfully. Consider trade-offs and document your decisions.',
      complex: 'Design and implement this carefully. Think critically about edge cases, maintainability, and future extensibility. Propose alternative approaches if you see better solutions.',
      very_complex: 'This is novel work. Research, experiment, and iterate. Document your thought process, trade-offs, and lessons learned. Challenge assumptions and propose creative solutions.',
    };

    return messages[complexity];
  }

  /**
   * Generate flexibility note
   */
  private generateFlexibilityNote(complexity: ComplexityLevel): string {
    const notes = {
      trivial: 'This rubric covers the basics. If you see a better way, go for it.',
      simple: 'This rubric is guidance, not gospel. If you have a better approach with good rationale, use it.',
      moderate: 'This rubric supports your work. Deviate when justified - document WHY you chose differently.',
      complex: 'This rubric is a starting point. You may discover better approaches as you work. Think critically and adapt.',
      very_complex: 'This rubric provides structure, not limitations. Novel work requires autonomy. Think outside the lines, experiment, and document your journey.',
    };

    return notes[complexity];
  }

  /**
   * Estimate time based on complexity
   */
  private estimateTime(task: Task, complexity: ComplexityLevel): number {
    // Use task's estimate if provided
    if (task.estimated_hours && task.estimated_hours > 0) {
      return task.estimated_hours * 60;
    }

    // Default estimates by complexity (minutes)
    const defaults = {
      trivial: 15,
      simple: 60,
      moderate: 240, // 4 hours
      complex: 480, // 8 hours
      very_complex: 960, // 16 hours
    };

    return defaults[complexity];
  }

  /**
   * Format rubric for agent prompt
   */
  formatForPrompt(rubric: TaskRubric): string {
    const lines: string[] = [];

    lines.push(`# Quality Rubric: ${rubric.taskId}`);
    lines.push('');
    lines.push(`**Complexity**: ${rubric.complexity}`);
    lines.push(`**Estimated Time**: ${rubric.estimatedTime} minutes`);
    lines.push('');
    lines.push(`## Core Message`);
    lines.push(rubric.coreMessage);
    lines.push('');
    lines.push(`## Quality Standards`);
    lines.push('');

    rubric.items.forEach((item, index) => {
      const required = item.required ? '**[REQUIRED]**' : '*[Recommended]*';
      lines.push(`### ${index + 1}. ${item.dimension.replace(/_/g, ' ').toUpperCase()} ${required}`);
      lines.push('');
      lines.push(item.description);
      lines.push('');

      if (item.guidance.length > 0) {
        lines.push('**How to achieve:**');
        item.guidance.forEach(g => lines.push(`- ${g}`));
        lines.push('');
      }

      if (item.examples && item.examples.length > 0) {
        lines.push('**Examples:**');
        item.examples.forEach(e => lines.push(`- ${e}`));
        lines.push('');
      }
    });

    lines.push(`## Autonomy & Flexibility`);
    lines.push('');
    lines.push(rubric.flexibilityNote);
    lines.push('');

    if (rubric.autonomy.encourageCreativity) {
      lines.push('✅ **Creativity encouraged** - Think outside the box if you see better solutions');
    }

    if (rubric.autonomy.allowDeviations) {
      lines.push('✅ **Deviations allowed** - You can deviate from this rubric if justified');
    }

    if (rubric.autonomy.requireJustification) {
      lines.push('✅ **Document decisions** - Explain why you chose your approach (especially if deviating)');
    }

    if (rubric.autonomy.suggestAlternatives) {
      lines.push('✅ **Suggest alternatives** - If you see a better way, propose it!');
    }

    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*Remember: This rubric supports your quality standards and keeps you on track, but does NOT limit you to the narrowest purview. Sometimes agents need to be autonomous and think outside the lines.*');

    return lines.join('\n');
  }

  /**
   * Generate batch of rubrics for multiple tasks
   */
  generateBatch(tasks: Task[]): Map<string, TaskRubric> {
    const rubrics = new Map<string, TaskRubric>();

    tasks.forEach(task => {
      rubrics.set(task.id, this.generateRubric(task));
    });

    return rubrics;
  }

  /**
   * Get summary statistics for a rubric
   */
  getSummary(rubric: TaskRubric): {
    complexity: ComplexityLevel;
    requiredItems: number;
    recommendedItems: number;
    totalDimensions: number;
    allowsCreativity: boolean;
    allowsDeviations: boolean;
  } {
    const requiredItems = rubric.items.filter(i => i.required).length;
    const recommendedItems = rubric.items.filter(i => !i.required).length;

    return {
      complexity: rubric.complexity,
      requiredItems,
      recommendedItems,
      totalDimensions: rubric.items.length,
      allowsCreativity: rubric.autonomy.encourageCreativity,
      allowsDeviations: rubric.autonomy.allowDeviations,
    };
  }
}
