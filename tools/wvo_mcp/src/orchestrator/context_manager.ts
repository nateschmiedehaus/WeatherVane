/**
 * ContextManager - Dynamic, intelligent context loading for agents
 *
 * Assembles relevant context based on:
 * - Task complexity (simple/moderate/complex)
 * - Task domain (product, infrastructure)
 * - Recent decisions and constraints
 * - Relevant documentation
 * - Code patterns and architecture
 */

import fs from 'node:fs';
import path from 'node:path';
import { MCPClient } from './mcp_client.js';
import { logInfo, logWarning } from '../telemetry/logger.js';

import type { Task } from './state_machine.js';

export type ContextComplexity = 'minimal' | 'detailed' | 'comprehensive';

export interface ContextPackage {
  complexity: ContextComplexity;
  relevantDocs: string[];
  recentDecisions: string[];
  codebaseOverview: string;
  qualityStandards: string;
  architectureGuidance: string;
  contextSize: number;
}

export class ContextManager {
  private readonly mcpClient?: MCPClient;
  private contextPersistenceEnabled = true;

  constructor(
    private readonly workspaceRoot: string,
    mcpClient?: MCPClient // Optional for backward compatibility
  ) {
    this.mcpClient = mcpClient;
    if (mcpClient) {
      logInfo('ContextManager: MCP context persistence enabled');
    } else {
      logInfo('ContextManager: Running in local mode (no MCP persistence)');
    }
  }

  /**
   * Assemble context package for a task
   */
  assembleContext(task: Task, complexity: ContextComplexity): ContextPackage {
    const pkg: ContextPackage = {
      complexity,
      relevantDocs: [],
      recentDecisions: [],
      codebaseOverview: '',
      qualityStandards: '',
      architectureGuidance: '',
      contextSize: 0
    };

    // Load context based on complexity
    if (complexity === 'minimal') {
      pkg.codebaseOverview = this.loadMinimalCodebaseOverview();
      pkg.qualityStandards = this.loadMinimalQualityStandards();
    } else if (complexity === 'detailed') {
      pkg.codebaseOverview = this.loadDetailedCodebaseOverview();
      pkg.qualityStandards = this.loadDetailedQualityStandards();
      pkg.relevantDocs = this.findRelevantDocs(task, 3);
      pkg.recentDecisions = this.loadRecentDecisions(5);
    } else {
      // Comprehensive
      pkg.codebaseOverview = this.loadComprehensiveCodebaseOverview();
      pkg.qualityStandards = this.loadComprehensiveQualityStandards();
      pkg.architectureGuidance = this.loadArchitectureGuidance(task);
      pkg.relevantDocs = this.findRelevantDocs(task, 5);
      pkg.recentDecisions = this.loadRecentDecisions(10);
    }

    pkg.contextSize = this.estimateContextSize(pkg);

    // Persist to MCP if available
    this.persistContextToMCP(task.id, pkg);

    return pkg;
  }

  /**
   * Persist assembled context to MCP for recovery
   */
  private async persistContextToMCP(taskId: string, pkg: ContextPackage): Promise<void> {
    if (!this.mcpClient || !this.contextPersistenceEnabled) {
      return;
    }

    try {
      // Create a summarized context for MCP persistence
      const contextSummary = this.summarizeContext(pkg);

      // Write to MCP context
      const response = await this.mcpClient.contextWrite(
        `Task Context - ${taskId}`,
        contextSummary,
        false // Replace, don't append
      );

      if (response?.success) {
        logInfo('ContextManager: Persisted context to MCP', {
          taskId,
          size: response.content_length
        });
      }
    } catch (error) {
      logWarning('ContextManager: Failed to persist context to MCP', {
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Disable MCP persistence for this session to avoid repeated failures
      this.contextPersistenceEnabled = false;
    }
  }

  /**
   * Summarize context package for MCP persistence
   */
  private summarizeContext(pkg: ContextPackage): string {
    const sections: string[] = [];

    sections.push(`**Complexity:** ${pkg.complexity}`);
    sections.push(`**Context Size:** ${pkg.contextSize} tokens (est.)`);

    if (pkg.relevantDocs.length > 0) {
      sections.push(`**Relevant Docs:** ${pkg.relevantDocs.join(', ')}`);
    }

    if (pkg.recentDecisions.length > 0) {
      sections.push('**Recent Decisions:**');
      sections.push(...pkg.recentDecisions.slice(0, 5));
    }

    if (pkg.architectureGuidance) {
      sections.push('**Architecture Focus:** ' +
        (pkg.architectureGuidance.includes('API') ? 'API Design' :
         pkg.architectureGuidance.includes('UI') ? 'UI Components' :
         pkg.architectureGuidance.includes('Model') ? 'ML/Forecasting' : 'General'));
    }

    return sections.join('\n');
  }

  /**
   * Load minimal codebase overview for simple tasks
   */
  private loadMinimalCodebaseOverview(): string {
    return `## Codebase Structure
- **apps/api/**: FastAPI backend (Python)
- **apps/web/**: Next.js frontend (TypeScript/React)
- **apps/model/**: Modeling & forecasting (Python/Polars)
- **tests/**: Test suites (pytest, vitest)
`;
  }

  /**
   * Load detailed codebase overview for moderate tasks
   */
  private loadDetailedCodebaseOverview(): string {
    return `## Codebase Architecture

### Backend (Python/FastAPI)
- **apps/api/**: Main API server
  - routes/: API endpoints
  - services/: Business logic
  - schemas/: Pydantic models
- **apps/model/**: ML models & forecasting
- **apps/worker/**: Ingestion pipelines (Prefect)

### Frontend (Next.js/React)
- **apps/web/src/**:
  - pages/: Route components
  - components/: Reusable UI
  - lib/: Utilities & helpers
  - styles/: CSS modules

### Shared
- **shared/**: Common schemas, libs, utils
- **state/**: Persistent state & config
- **docs/**: Technical documentation
`;
  }

  /**
   * Load comprehensive codebase overview for complex tasks
   */
  private loadComprehensiveCodebaseOverview(): string {
    const overview = this.loadDetailedCodebaseOverview();

    return overview + `
### Key Architecture Patterns

**API Layer**:
- RESTful design with FastAPI
- Pydantic schemas for validation
- Service layer for business logic
- Dependency injection for DB/state

**Frontend Layer**:
- Server-side rendering (Next.js)
- React hooks for state management
- CSS modules for styling
- Type-safe with TypeScript

**Data Layer**:
- Polars for data processing
- DuckDB for analytics
- Postgres for metadata
- Parquet for storage

**Testing Strategy**:
- Unit tests (pytest, vitest)
- Integration tests (FastAPI TestClient)
- E2E tests (Playwright)
- Visual regression testing
`;
  }

  /**
   * Load quality standards based on complexity
   */
  private loadMinimalQualityStandards(): string {
    return `## Quality Requirements
- Clean, readable code
- Type safety (TypeScript/Python hints)
- Tests must pass
- No debugging code left behind
`;
  }

  private loadDetailedQualityStandards(): string {
    return `## Quality Standards

**Code Quality**:
- Clean, readable, maintainable
- Type safety throughout
- Proper error handling
- No console.log/print debugging
- Meaningful variable names

**Testing**:
- Unit tests for new functions
- Integration tests for APIs
- All tests must pass
- Edge cases covered

**Design** (UI tasks):
- Responsive layouts
- Professional styling
- No AI slop
- Accessibility basics
`;
  }

  private loadComprehensiveQualityStandards(): string {
    return `## World-Class Quality Standards

**Code Excellence**:
- Clean Architecture principles
- SOLID principles
- DRY (Don't Repeat Yourself)
- Type safety everywhere
- Comprehensive error handling
- Logging for debugging
- Performance optimization

**Testing Excellence**:
- Unit tests (100% coverage for new code)
- Integration tests (API contracts)
- E2E tests (user flows)
- Visual regression tests (UI)
- Performance tests (load testing)
- Edge cases & error scenarios
- Tests prove behavior, not just coverage

**Design Excellence** (UI/UX):
- Use Playwright for design validation
- Reference top SaaS products
- Responsive: mobile, tablet, desktop
- Accessibility (WCAG 2.1 AA)
- Motion design (smooth transitions)
- Professional typography
- Cohesive color system
- Polish every detail - NO AI SLOP

**Documentation**:
- Clear inline comments
- API documentation
- Architecture decisions
- Examples & usage guides
`;
  }

  /**
   * Load architecture guidance for specific tasks
   */
  private loadArchitectureGuidance(task: Task): string {
    const title = task.title?.toLowerCase() || '';

    if (title.includes('api') || title.includes('route')) {
      return this.loadAPIArchitectureGuidance();
    } else if (title.includes('ui') || title.includes('component')) {
      return this.loadUIArchitectureGuidance();
    } else if (title.includes('model') || title.includes('forecast')) {
      return this.loadModelArchitectureGuidance();
    }

    return '';
  }

  private loadAPIArchitectureGuidance(): string {
    return `## API Architecture Guidance

**Route Design**:
- RESTful conventions (GET, POST, PUT, DELETE)
- Consistent URL patterns
- Versioning if needed

**Schema Validation**:
- Pydantic models for request/response
- Proper typing
- Validation errors with clear messages

**Service Layer**:
- Business logic in services, not routes
- Dependency injection
- Testable, isolated functions

**Error Handling**:
- HTTP status codes
- Structured error responses
- Logging for debugging
`;
  }

  private loadUIArchitectureGuidance(): string {
    return `## UI Architecture Guidance

**Component Design**:
- Single responsibility
- Reusable & composable
- Props with TypeScript interfaces
- CSS modules for styling

**State Management**:
- React hooks (useState, useEffect)
- Custom hooks for complex logic
- Context for shared state

**Performance**:
- Lazy loading
- Memoization (useMemo, useCallback)
- Code splitting

**Testing**:
- Component unit tests
- Interaction testing
- Visual regression
`;
  }

  private loadModelArchitectureGuidance(): string {
    return `## Modeling Architecture Guidance

**Data Pipeline**:
- Polars for transformations
- Type-safe schemas
- Validation at each step

**Model Design**:
- Modular, testable components
- Clear interfaces
- Logging & metrics

**Forecasting**:
- Quantile predictions
- Calibration metrics
- Backtesting
`;
  }

  /**
   * Find relevant documentation for the task
   */
  private findRelevantDocs(task: Task, limit: number): string[] {
    const docs: string[] = [];
    const docsDir = path.join(this.workspaceRoot, 'docs');

    if (!fs.existsSync(docsDir)) return docs;

    const title = task.title?.toLowerCase() || '';
    const description = task.description?.toLowerCase() || '';
    const searchText = `${title} ${description}`;

    // Map keywords to doc files
    const docMap: Record<string, string[]> = {
      'modeling|forecast|mmm': ['MODELING_REALITY_CHECK.md', 'docs/modeling/'],
      'weather|geo': ['weather/', 'WEATHER_COVERAGE.md'],
      'ui|component|design': ['WEB_DESIGN_SYSTEM.md', 'UX_CRITIQUE.md'],
      'test|testing': ['TESTING.md'],
      'ingestion|pipeline': ['INGESTION.md'],
      'api|route|endpoint': ['DEVELOPMENT.md', 'api/'],
      'phase.?0|phase.?1': ['product/PHASE0_PHASE1_EXECUTION_PLAN.md']
    };

    for (const [pattern, docFiles] of Object.entries(docMap)) {
      if (new RegExp(pattern).test(searchText)) {
        docs.push(...docFiles);
      }
    }

    return docs.slice(0, limit);
  }

  /**
   * Load recent decisions from context
   */
  private loadRecentDecisions(limit: number): string[] {
    const contextPath = path.join(this.workspaceRoot, 'state', 'context.md');

    if (!fs.existsSync(contextPath)) return [];

    try {
      const content = fs.readFileSync(contextPath, 'utf-8');
      const decisions: string[] = [];

      // Extract decisions from context
      const decisionSection = content.match(/## Recent Decisions\n([\s\S]*?)(?=\n##|$)/i);
      if (decisionSection) {
        const lines = decisionSection[1].split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
            decisions.push(line.trim());
            if (decisions.length >= limit) break;
          }
        }
      }

      return decisions;
    } catch {
      return [];
    }
  }

  /**
   * Estimate context size in tokens (rough approximation)
   */
  private estimateContextSize(pkg: ContextPackage): number {
    let size = 0;

    size += pkg.codebaseOverview.length / 4; // ~4 chars per token
    size += pkg.qualityStandards.length / 4;
    size += pkg.architectureGuidance.length / 4;
    size += pkg.relevantDocs.reduce((sum, doc) => sum + doc.length / 4, 0);
    size += pkg.recentDecisions.reduce((sum, d) => sum + d.length / 4, 0);

    return Math.ceil(size);
  }
}
