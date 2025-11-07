/**
 * Documentation Reader for Wave 0.1
 *
 * Makes system documentation available to Wave 0:
 * - CLAUDE.md - Claude operating instructions
 * - agents.md - Agent descriptions and capabilities
 * - MANDATORY_WORK_CHECKLIST.md - AFP process requirements
 * - Other critical system docs
 *
 * This ensures Wave 0 understands and follows the same
 * principles and processes as manual operators.
 */

import { RealMCPClient } from './real_mcp_client.js';
import { logInfo, logWarning } from '../telemetry/logger.js';
import * as path from 'path';

export interface SystemDoc {
  name: string;
  path: string;
  category: 'process' | 'agent' | 'quality' | 'architecture' | 'guide';
  priority: 'critical' | 'important' | 'reference';
  content?: string;
}

export class DocumentationReader {
  private mcp: RealMCPClient;
  private docsCache: Map<string, SystemDoc> = new Map();
  private workspaceRoot: string;

  // Critical system documentation
  private readonly systemDocs: SystemDoc[] = [
    // Process Documentation
    {
      name: 'MANDATORY_WORK_CHECKLIST',
      path: 'MANDATORY_WORK_CHECKLIST.md',
      category: 'process',
      priority: 'critical'
    },
    {
      name: 'CLAUDE',
      path: 'CLAUDE.md',
      category: 'agent',
      priority: 'critical'
    },
    {
      name: 'agents',
      path: 'agents.md',
      category: 'agent',
      priority: 'critical'
    },
    // AFP Documentation
    {
      name: 'AFP_PRINCIPLES',
      path: 'docs/AFP_PRINCIPLES.md',
      category: 'process',
      priority: 'critical'
    },
    {
      name: 'AFP_REVIEWER_ROUTINE',
      path: 'docs/workflows/AFP_REVIEWER_ROUTINE.md',
      category: 'process',
      priority: 'important'
    },
    // Quality Documentation
    {
      name: 'UNIVERSAL_TEST_STANDARDS',
      path: 'docs/UNIVERSAL_TEST_STANDARDS.md',
      category: 'quality',
      priority: 'critical'
    },
    {
      name: 'QUALITY_GATES',
      path: 'docs/QUALITY_GATES.md',
      category: 'quality',
      priority: 'important'
    },
    // Architecture Documentation
    {
      name: 'ARCHITECTURE',
      path: 'docs/ARCHITECTURE.md',
      category: 'architecture',
      priority: 'important'
    },
    {
      name: 'MCP_ARCHITECTURE',
      path: 'tools/wvo_mcp/ARCHITECTURE_V2.md',
      category: 'architecture',
      priority: 'important'
    },
    // Orchestration Documentation
    {
      name: 'ERROR_DETECTION_GUIDE',
      path: 'docs/orchestration/ERROR_DETECTION_GUIDE.md',
      category: 'guide',
      priority: 'important'
    },
    {
      name: 'AUTO_REMEDIATION_SYSTEM',
      path: 'docs/orchestration/AUTO_REMEDIATION_SYSTEM.md',
      category: 'guide',
      priority: 'important'
    },
    {
      name: 'AUTOPILOT_VALIDATION_RULES',
      path: 'docs/orchestration/AUTOPILOT_VALIDATION_RULES.md',
      category: 'process',
      priority: 'critical'
    },
    // Verification Documentation
    {
      name: 'MANDATORY_VERIFICATION_LOOP',
      path: 'docs/MANDATORY_VERIFICATION_LOOP.md',
      category: 'process',
      priority: 'critical'
    },
    // Wave 0 Specific
    {
      name: 'WAVE0_README',
      path: 'state/epics/WAVE-0/README.md',
      category: 'guide',
      priority: 'critical'
    }
  ];

  constructor(mcp: RealMCPClient, workspaceRoot: string) {
    this.mcp = mcp;
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Load all critical documentation
   */
  async loadCriticalDocs(): Promise<void> {
    logInfo('DocumentationReader: Loading critical system documentation');

    const critical = this.systemDocs.filter(doc => doc.priority === 'critical');

    for (const doc of critical) {
      try {
        await this.loadDocument(doc);
      } catch (error) {
        logWarning(`Failed to load critical doc ${doc.name}`, { error });
      }
    }

    logInfo(`DocumentationReader: Loaded ${this.docsCache.size} documents`);
  }

  /**
   * Load a specific document
   */
  async loadDocument(doc: SystemDoc): Promise<SystemDoc> {
    try {
      const fullPath = path.join(this.workspaceRoot, doc.path);
      const content = await this.mcp.read(fullPath);

      const loadedDoc = { ...doc, content };
      this.docsCache.set(doc.name, loadedDoc);

      logInfo(`Loaded document: ${doc.name} (${content.length} bytes)`);
      return loadedDoc;
    } catch (error) {
      logWarning(`Failed to load ${doc.name} from ${doc.path}`, { error });
      throw error;
    }
  }

  /**
   * Get document by name
   */
  getDocument(name: string): SystemDoc | undefined {
    return this.docsCache.get(name);
  }

  /**
   * Get all documents by category
   */
  getDocumentsByCategory(category: string): SystemDoc[] {
    return Array.from(this.docsCache.values())
      .filter(doc => doc.category === category);
  }

  /**
   * Extract AFP process requirements
   */
  getAFPRequirements(): string {
    const mandatoryChecklist = this.getDocument('MANDATORY_WORK_CHECKLIST');
    const afpPrinciples = this.getDocument('AFP_PRINCIPLES');

    if (!mandatoryChecklist || !afpPrinciples) {
      logWarning('AFP documentation not loaded');
      return 'AFP documentation not available';
    }

    return `# AFP Process Requirements

## From MANDATORY_WORK_CHECKLIST:
${this.extractSection(mandatoryChecklist.content!, 'AFP 10-Phase Lifecycle')}

## From AFP_PRINCIPLES:
${this.extractSection(afpPrinciples.content!, 'Core Principles')}
`;
  }

  /**
   * Extract agent capabilities
   */
  getAgentCapabilities(): string {
    const claudeDoc = this.getDocument('CLAUDE');
    const agentsDoc = this.getDocument('agents');

    if (!claudeDoc || !agentsDoc) {
      logWarning('Agent documentation not loaded');
      return 'Agent documentation not available';
    }

    return `# Agent Capabilities

## Claude Instructions:
${this.extractSection(claudeDoc.content!, 'Mission')}

## Available Agents:
${this.extractSection(agentsDoc.content!, 'Agent')}
`;
  }

  /**
   * Extract quality requirements
   */
  getQualityRequirements(): string {
    const testStandards = this.getDocument('UNIVERSAL_TEST_STANDARDS');
    const qualityGates = this.getDocument('QUALITY_GATES');

    if (!testStandards || !qualityGates) {
      logWarning('Quality documentation not loaded');
      return 'Quality documentation not available';
    }

    return `# Quality Requirements

## Test Standards:
${this.extractSection(testStandards.content!, 'Test Dimensions')}

## Quality Gates:
${this.extractSection(qualityGates.content!, 'Gates')}
`;
  }

  /**
   * Extract verification requirements
   */
  getVerificationRequirements(): string {
    const verificationLoop = this.getDocument('MANDATORY_VERIFICATION_LOOP');

    if (!verificationLoop) {
      return 'Verification documentation not available';
    }

    return `# Verification Requirements

${this.extractSection(verificationLoop.content!, 'The Verification Loop')}
`;
  }

  /**
   * Get instructions for Wave 0 operation
   */
  getWave0Instructions(): string {
    // Combine all critical instructions for Wave 0
    const instructions: string[] = [];

    // AFP Process
    const afp = this.getAFPRequirements();
    if (afp !== 'AFP documentation not available') {
      instructions.push(afp);
    }

    // Agent capabilities
    const agents = this.getAgentCapabilities();
    if (agents !== 'Agent documentation not available') {
      instructions.push(agents);
    }

    // Quality requirements
    const quality = this.getQualityRequirements();
    if (quality !== 'Quality documentation not available') {
      instructions.push(quality);
    }

    // Verification requirements
    const verification = this.getVerificationRequirements();
    if (verification !== 'Verification documentation not available') {
      instructions.push(verification);
    }

    return instructions.join('\n\n---\n\n');
  }

  /**
   * Extract section from markdown content
   */
  private extractSection(content: string, sectionTitle: string): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex(line =>
      line.includes(sectionTitle)
    );

    if (startIndex === -1) {
      return `Section "${sectionTitle}" not found`;
    }

    // Find next section of same or higher level
    const startLine = lines[startIndex];
    const level = startLine.match(/^#+/)?.[0].length || 0;

    let endIndex = lines.length;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const lineLevel = line.match(/^#+/)?.[0].length || 0;

      if (lineLevel > 0 && lineLevel <= level) {
        endIndex = i;
        break;
      }
    }

    return lines.slice(startIndex, endIndex).join('\n');
  }

  /**
   * Search documentation for specific topic
   */
  searchDocumentation(query: string): SystemDoc[] {
    const results: SystemDoc[] = [];
    const queryLower = query.toLowerCase();

    for (const doc of this.docsCache.values()) {
      if (!doc.content) continue;

      const contentLower = doc.content.toLowerCase();
      if (
        contentLower.includes(queryLower) ||
        doc.name.toLowerCase().includes(queryLower)
      ) {
        results.push(doc);
      }
    }

    return results;
  }

  /**
   * Get summary of all loaded documentation
   */
  getSummary(): string {
    const byCategory = new Map<string, SystemDoc[]>();

    for (const doc of this.docsCache.values()) {
      const category = doc.category;
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(doc);
    }

    let summary = '# Loaded System Documentation\n\n';

    for (const [category, docs] of byCategory) {
      summary += `## ${category.toUpperCase()}\n`;
      for (const doc of docs) {
        const size = doc.content ? `(${doc.content.length} bytes)` : '(not loaded)';
        summary += `- ${doc.name} [${doc.priority}] ${size}\n`;
      }
      summary += '\n';
    }

    summary += `\nTotal documents loaded: ${this.docsCache.size}`;

    return summary;
  }

  /**
   * Refresh documentation cache
   */
  async refresh(): Promise<void> {
    this.docsCache.clear();
    await this.loadCriticalDocs();
  }
}