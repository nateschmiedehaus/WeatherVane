/**
 * Domain Expert Reviewer
 *
 * Implements multi-domain genius-level reviews that go beyond checkbox thinking.
 * Reviews tasks from multiple expert perspectives: statistics, philosophy, design,
 * domain expertise, cutting-edge research, and practitioner experience.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import type { TaskEvidence } from './adversarial_bullshit_detector.js';

// Simple model router interface for dependency injection
export interface ModelRouter {
  route(prompt: string, complexity: string): Promise<string>;
  getLastModelUsed(): string | undefined;
}

export interface DomainExpertise {
  id: string;
  name: string;
  description: string;
  keyQuestions: string[];
  expertModel: string;
  reasoningEffort: 'low' | 'medium' | 'high';
}

export interface DomainRegistry {
  domains: DomainExpertise[];
  taskTypeMappings: Array<{
    pattern: string;
    domains: string[];
  }>;
}

export interface ExpertReview {
  domainId: string;
  domainName: string;
  approved: boolean;
  depth: 'genius' | 'competent' | 'superficial';
  concerns: string[];
  recommendations: string[];
  reasoning: string;
  modelUsed: string;
  timestamp: number;
}

export interface MultiDomainReview {
  taskId: string;
  reviews: ExpertReview[];
  consensusApproved: boolean;
  overallDepth: 'genius' | 'competent' | 'superficial';
  criticalConcerns: string[];
  synthesis: string;
  timestamp: number;
}

/**
 * Domain Expert Reviewer - Multi-perspective genius-level reviews
 */
export class DomainExpertReviewer {
  private workspaceRoot: string;
  private modelRouter: ModelRouter;
  private domainRegistry?: DomainRegistry;
  private promptTemplates: Map<string, string> = new Map();

  constructor(workspaceRoot: string, modelRouter: ModelRouter) {
    this.workspaceRoot = workspaceRoot;
    this.modelRouter = modelRouter;
  }

  /**
   * Load domain registry from YAML
   */
  async loadDomainRegistry(): Promise<void> {
    const registryPath = path.join(this.workspaceRoot, 'state', 'domain_expertise.yaml');

    try {
      const content = await fs.readFile(registryPath, 'utf-8');
      this.domainRegistry = yaml.parse(content) as DomainRegistry;
      logInfo('Loaded domain expertise registry', {
        domainCount: this.domainRegistry.domains.length
      });
    } catch (error) {
      logWarning('Failed to load domain registry, using defaults', { error });
      this.domainRegistry = this.getDefaultRegistry();
    }
  }

  /**
   * Load prompt template for a specific expert type
   */
  async loadPromptTemplate(templateName: string): Promise<string> {
    if (this.promptTemplates.has(templateName)) {
      return this.promptTemplates.get(templateName)!;
    }

    const candidatePaths = [
      path.join(this.workspaceRoot, 'prompts', 'genius_reviews', `${templateName}.md`),
      path.join(this.workspaceRoot, 'tools', 'wvo_mcp', 'prompts', 'genius_reviews', `${templateName}.md`),
    ];

    for (const templatePath of candidatePaths) {
      try {
        const content = await fs.readFile(templatePath, 'utf-8');
        this.promptTemplates.set(templateName, content);
        return content;
      } catch {
        // try next candidate
      }
    }

    logWarning(`Failed to load prompt template ${templateName}`, { attempted: candidatePaths });
    return this.getDefaultPromptTemplate(templateName);
  }

  /**
   * Identify required domains for a task based on title and description
   */
  identifyRequiredDomains(taskTitle?: string, taskDescription?: string): string[] {
    if (!this.domainRegistry) {
      return [];
    }

    const requiredDomains = new Set<string>();
    const combinedText = `${taskTitle || ''} ${taskDescription || ''}`.toLowerCase();

    // Check task type mappings
    for (const mapping of this.domainRegistry.taskTypeMappings) {
      const regex = new RegExp(mapping.pattern, 'i');
      if (regex.test(combinedText)) {
        mapping.domains.forEach(d => requiredDomains.add(d));
      }
    }

    // If no domains identified, use core set
    if (requiredDomains.size === 0) {
      return [
        'software_architecture',
        'philosophy_systems_thinking',
        'practitioner_production'
      ];
    }

    return Array.from(requiredDomains);
  }

  /**
   * Run a single domain expert review
   */
  async runExpertReview(
    domain: DomainExpertise,
    evidence: TaskEvidence
  ): Promise<ExpertReview> {
    logInfo(`Running ${domain.name} review`, { taskId: evidence.taskId });

    // Load appropriate prompt template
    const templateName = this.getTemplateNameForDomain(domain.id);
    const promptTemplate = await this.loadPromptTemplate(templateName);

    // Fill in template with evidence
    const prompt = this.fillPromptTemplate(promptTemplate, domain, evidence);

    // Route to appropriate model based on domain
    const complexity = domain.reasoningEffort === 'high' ? 'complex' :
                      domain.reasoningEffort === 'medium' ? 'medium' : 'simple';

    try {
      const response = await this.modelRouter.route(prompt, complexity);

      // Parse response (expect JSON)
      const review = this.parseExpertReviewResponse(response, domain);

      return {
        domainId: domain.id,
        domainName: domain.name,
        ...review,
        modelUsed: this.modelRouter.getLastModelUsed() || domain.expertModel,
        timestamp: Date.now(),
      };
    } catch (error) {
      logError(`Expert review failed for ${domain.name}`, { error, taskId: evidence.taskId });

      // Return conservative rejection on error
      return {
        domainId: domain.id,
        domainName: domain.name,
        approved: false,
        depth: 'superficial',
        concerns: [`Expert review failed: ${error}`],
        recommendations: ['Retry expert review'],
        reasoning: 'Review failed due to error',
        modelUsed: domain.expertModel,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Run multi-domain review with genius-level perspectives
   */
  async reviewTaskWithMultipleDomains(
    evidence: TaskEvidence,
    domainIds?: string[]
  ): Promise<MultiDomainReview> {
    if (!this.domainRegistry) {
      await this.loadDomainRegistry();
    }

    // Identify required domains if not specified
    const domainsToReview = domainIds ||
                           this.identifyRequiredDomains(evidence.title, evidence.description);

    logInfo('Running multi-domain genius-level review', {
      taskId: evidence.taskId,
      domains: domainsToReview,
    });

    // Get domain expertise objects
    const domains = domainsToReview
      .map(id => this.domainRegistry!.domains.find(d => d.id === id))
      .filter((d): d is DomainExpertise => d !== undefined);

    if (domains.length === 0) {
      logWarning('No domains found for review, using defaults', { taskId: evidence.taskId });
      return this.createDefaultReview(evidence);
    }

    // Run all expert reviews in parallel
    const reviews = await Promise.all(
      domains.map(domain => this.runExpertReview(domain, evidence))
    );

    // Synthesize results
    const synthesis = this.synthesizeReviews(reviews);

    return {
      taskId: evidence.taskId,
      reviews,
      consensusApproved: synthesis.approved,
      overallDepth: synthesis.depth,
      criticalConcerns: synthesis.concerns,
      synthesis: synthesis.reasoning,
      timestamp: Date.now(),
    };
  }

  /**
   * Synthesize multiple expert reviews into a consensus
   */
  private synthesizeReviews(reviews: ExpertReview[]): {
    approved: boolean;
    depth: 'genius' | 'competent' | 'superficial';
    concerns: string[];
    reasoning: string;
  } {
    // Require unanimous approval from all experts
    const allApproved = reviews.every(r => r.approved);

    // Overall depth is the minimum (weakest link)
    const depthOrder = { 'superficial': 0, 'competent': 1, 'genius': 2 };
    const minDepth = reviews.reduce((min, r) => {
      return depthOrder[r.depth] < depthOrder[min] ? r.depth : min;
    }, 'genius' as 'genius' | 'competent' | 'superficial');

    // Collect all critical concerns
    const allConcerns = reviews.flatMap(r =>
      r.concerns.map(c => `[${r.domainName}] ${c}`)
    );

    // Generate synthesis reasoning
    const approvedCount = reviews.filter(r => r.approved).length;
    const reasoning = this.generateSynthesisReasoning(reviews, allApproved, minDepth);

    return {
      approved: allApproved,
      depth: minDepth,
      concerns: allConcerns,
      reasoning,
    };
  }

  /**
   * Generate synthesis reasoning from multiple reviews
   */
  private generateSynthesisReasoning(
    reviews: ExpertReview[],
    allApproved: boolean,
    overallDepth: string
  ): string {
    const approvedCount = reviews.filter(r => r.approved).length;
    const total = reviews.length;

    let reasoning = `Multi-domain review completed: ${approvedCount}/${total} experts approved.\n\n`;

    if (allApproved) {
      reasoning += '✅ Unanimous approval from all domain experts.\n\n';
    } else {
      reasoning += `❌ Consensus NOT reached. ${total - approvedCount} expert(s) rejected.\n\n`;
    }

    reasoning += `Overall depth assessment: ${overallDepth}\n\n`;

    // Summarize each expert's view
    reasoning += '## Expert Perspectives:\n\n';
    for (const review of reviews) {
      reasoning += `### ${review.domainName} (${review.approved ? 'APPROVED' : 'REJECTED'})\n`;
      reasoning += `Depth: ${review.depth}\n`;
      if (review.concerns.length > 0) {
        reasoning += `Concerns:\n`;
        review.concerns.forEach(c => reasoning += `- ${c}\n`);
      }
      if (review.recommendations.length > 0) {
        reasoning += `Recommendations:\n`;
        review.recommendations.forEach(r => reasoning += `- ${r}\n`);
      }
      reasoning += `\n`;
    }

    return reasoning;
  }

  /**
   * Parse expert review response (expecting JSON)
   */
  private parseExpertReviewResponse(
    response: string,
    domain: DomainExpertise
  ): Omit<ExpertReview, 'domainId' | 'domainName' | 'modelUsed' | 'timestamp'> {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        approved: parsed.approved ?? false,
        depth: parsed.depth ?? 'superficial',
        concerns: parsed.concerns ?? [],
        recommendations: parsed.recommendations ?? [],
        reasoning: parsed.reasoning ?? response,
      };
    } catch (error) {
      logWarning(`Failed to parse expert review JSON for ${domain.name}`, { error });

      // Fallback: use entire response as reasoning
      return {
        approved: false,
        depth: 'superficial',
        concerns: ['Failed to parse expert review'],
        recommendations: [],
        reasoning: response,
      };
    }
  }

  /**
   * Fill prompt template with evidence
   */
  private fillPromptTemplate(
    template: string,
    domain: DomainExpertise,
    evidence: TaskEvidence
  ): string {
    return template
      .replace(/\{\{taskTitle\}\}/g, evidence.title || 'Untitled Task')
      .replace(/\{\{taskDescription\}\}/g, evidence.description || 'No description provided')
      .replace(/\{\{buildOutput\}\}/g, evidence.buildOutput)
      .replace(/\{\{testOutput\}\}/g, evidence.testOutput)
      .replace(/\{\{changedFiles\}\}/g, JSON.stringify(evidence.changedFiles))
      .replace(/\{\{documentation\}\}/g, JSON.stringify(evidence.documentation))
      .replace(/\{\{domainName\}\}/g, domain.name);
  }

  /**
   * Get template name for domain ID
   */
  private getTemplateNameForDomain(domainId: string): string {
    const mapping: Record<string, string> = {
      'statistics_timeseries': 'statistics_expert',
      'statistics_generalized_additive_models': 'statistics_expert',
      'statistics_causal_inference': 'statistics_expert',
      'philosophy_epistemology': 'philosopher',
      'philosophy_systems_thinking': 'philosopher',
      'domain_meteorology': 'domain_expert',
      'domain_energy_markets': 'domain_expert',
      'design_user_experience': 'design_expert',
      'design_aesthetics': 'design_expert',
      'research_cutting_edge': 'researcher',
      'practitioner_production': 'domain_expert',
      // Add more mappings as needed
    };

    return mapping[domainId] || 'domain_expert';
  }

  /**
   * Get default domain registry if file not found
   */
  private getDefaultRegistry(): DomainRegistry {
    return {
      domains: [
        {
          id: 'software_architecture',
          name: 'Software Architect',
          description: 'Expert in system design and scalability',
          keyQuestions: ['Is this scalable?', 'What are the failure modes?'],
          expertModel: 'claude-sonnet-4.5',
          reasoningEffort: 'medium',
        },
        {
          id: 'philosophy_systems_thinking',
          name: 'Systems Thinker',
          description: 'Expert in holistic analysis',
          keyQuestions: ['What are the feedback loops?', 'What about emergence?'],
          expertModel: 'claude-opus-4.1',
          reasoningEffort: 'high',
        },
        {
          id: 'practitioner_production',
          name: 'Production Practitioner',
          description: 'Expert in production systems and operational excellence',
          keyQuestions: ['Will this work in production?', 'What are the operational risks?'],
          expertModel: 'claude-sonnet-4.5',
          reasoningEffort: 'medium',
        },
        {
          id: 'statistics_timeseries',
          name: 'Time Series Statistician',
          description: 'Expert in time series analysis and forecasting',
          keyQuestions: ['Are the statistical assumptions valid?', 'Is this seasonally appropriate?'],
          expertModel: 'claude-opus-4.1',
          reasoningEffort: 'high',
        },
        {
          id: 'statistics_generalized_additive_models',
          name: 'GAM Specialist',
          description: 'Expert in generalized additive models',
          keyQuestions: ['Is the basis selection appropriate?', 'Are smoothness parameters well-tuned?'],
          expertModel: 'claude-opus-4.1',
          reasoningEffort: 'high',
        },
        {
          id: 'domain_meteorology',
          name: 'Meteorology Expert',
          description: 'Expert in weather science and meteorological systems',
          keyQuestions: ['Are the weather physics correctly modeled?', 'Is this meteorologically sound?'],
          expertModel: 'claude-opus-4.1',
          reasoningEffort: 'high',
        },
        {
          id: 'software_distributed_systems',
          name: 'Distributed Systems Expert',
          description: 'Expert in distributed systems and concurrent programming',
          keyQuestions: ['Will this scale to many nodes?', 'How are failures handled?'],
          expertModel: 'claude-sonnet-4.5',
          reasoningEffort: 'medium',
        },
      ],
      taskTypeMappings: [
        {
          pattern: '(gam|generalized additive)',
          domains: ['statistics_generalized_additive_models', 'statistics_timeseries'],
        },
        {
          pattern: '(forecast|timeseries|time series)',
          domains: ['statistics_timeseries', 'domain_meteorology'],
        },
        {
          pattern: '(weather|meteorolog)',
          domains: ['domain_meteorology', 'statistics_timeseries'],
        },
        {
          pattern: '(resource|lifecycle|pool|distributed)',
          domains: ['software_distributed_systems', 'software_architecture'],
        },
      ],
    };
  }

  /**
   * Get default prompt template
   */
  private getDefaultPromptTemplate(templateName: string): string {
    return `# Expert Review

Review the following task:

**Task**: {{taskTitle}}
**Description**: {{taskDescription}}

**Evidence**:
- Build: {{buildOutput}}
- Tests: {{testOutput}}
- Files: {{changedFiles}}

Provide your expert assessment in JSON format:

\`\`\`json
{
  "approved": true/false,
  "depth": "genius" | "competent" | "superficial",
  "concerns": ["concern1", "concern2"],
  "recommendations": ["rec1", "rec2"],
  "reasoning": "Your detailed reasoning here"
}
\`\`\`
`;
  }

  /**
   * Create default review when no domains available
   */
  private createDefaultReview(evidence: TaskEvidence): MultiDomainReview {
    return {
      taskId: evidence.taskId,
      reviews: [],
      consensusApproved: false,
      overallDepth: 'superficial',
      criticalConcerns: ['No domain experts available for review'],
      synthesis: 'Unable to perform multi-domain review - domain registry not available',
      timestamp: Date.now(),
    };
  }
}
