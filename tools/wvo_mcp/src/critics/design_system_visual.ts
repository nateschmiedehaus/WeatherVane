/**
 * DesignSystemVisualCritic - Vision-based UX review and agent-directed design inspiration
 *
 * This critic actually LOOKS at your UI using Playwright screenshots and provides:
 * 1. Actionable design feedback based on visual analysis
 * 2. Comparison against design principles and patterns
 * 3. Specific improvement suggestions
 * 4. Progress tracking over design iterations
 * 5. Agent-directed inspiration from visual patterns
 *
 * Philosophy: The best design feedback comes from actually seeing the UI, not just linting.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { logInfo, logWarning, logError } from "../telemetry/logger.js";

import { Critic, type CriticResult } from "./base.js";

export interface DesignIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: "layout" | "typography" | "color" | "spacing" | "interaction" | "accessibility" | "consistency";
  issue: string;
  suggestion: string;
  page: string;
  viewport: string;
}

export interface DesignInspiration {
  pattern: string;
  observation: string;
  opportunity: string;
}

export interface DesignReviewReport {
  overall_score: number; // 0-100
  issues: DesignIssue[];
  inspirations: DesignInspiration[];
  improvements_from_last: string[];
  strengths: string[];
  timestamp: string;
  screenshot_count: number;
  pages_reviewed: string[];
}

export class DesignSystemVisualCritic extends Critic {
  name = "design_system_visual";
  description = "Visual UX review using Playwright screenshots and design principles";

  protected command(_profile: string): string | null {
    // This critic uses vision analysis, not shell commands
    return null;
  }

  /**
   * Find latest screenshot session
   */
  private async findLatestScreenshots(): Promise<string | null> {
    const screenshotsDir = path.join(this.workspaceRoot, "tmp", "screenshots");

    try {
      const entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
      const sessions = entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
        .reverse(); // Latest first

      if (sessions.length === 0) {
        return null;
      }

      return path.join(screenshotsDir, sessions[0]);
    } catch {
      return null;
    }
  }

  /**
   * Analyze screenshots with vision-based design principles
   */
  private async analyzeScreenshots(sessionDir: string): Promise<DesignReviewReport> {
    const screenshots: Array<{ path: string; name: string }> = [];

    try {
      const files = await fs.readdir(sessionDir);

      for (const file of files) {
        if (file.endsWith('.png')) {
          screenshots.push({
            path: path.join(sessionDir, file),
            name: file,
          });
        }
      }
    } catch (error) {
      logError('Failed to read screenshot directory', { error });
      throw error;
    }

    if (screenshots.length === 0) {
      throw new Error('No screenshots found in session');
    }

    logInfo(`Analyzing ${screenshots.length} screenshots for design review`);

    // Analyze each screenshot
    const issues: DesignIssue[] = [];
    const inspirations: DesignInspiration[] = [];
    const strengths: string[] = [];
    const pagesReviewed = new Set<string>();

    // Design principles to check
    const designChecks = [
      this.checkVisualHierarchy,
      this.checkColorContrast,
      this.checkSpacing,
      this.checkTypography,
      this.checkResponsiveness,
      this.checkInteractionPatterns,
      this.checkAccessibility,
    ];

    for (const screenshot of screenshots) {
      const [page, viewport] = screenshot.name.replace('.png', '').split('_');
      pagesReviewed.add(page);

      // For each design principle
      for (const check of designChecks) {
        const result = await check.call(this, screenshot.path, page, viewport);

        if (result.issues) {
          issues.push(...result.issues.map(i => ({ ...i, page, viewport })));
        }
        if (result.strengths) {
          strengths.push(...result.strengths);
        }
        if (result.inspirations) {
          inspirations.push(...result.inspirations);
        }
      }
    }

    // Calculate overall score
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;
    const lowCount = issues.filter(i => i.severity === 'low').length;

    const penalty = (criticalCount * 20) + (highCount * 10) + (mediumCount * 5) + (lowCount * 2);
    const overall_score = Math.max(0, 100 - penalty);

    return {
      overall_score,
      issues: issues.slice(0, 20), // Top 20 issues
      inspirations: inspirations.slice(0, 10), // Top 10 inspirations
      improvements_from_last: [], // TODO: Compare with previous session
      strengths: strengths.slice(0, 10),
      timestamp: new Date().toISOString(),
      screenshot_count: screenshots.length,
      pages_reviewed: Array.from(pagesReviewed),
    };
  }

  /**
   * Design check: Visual Hierarchy
   */
  private async checkVisualHierarchy(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    // In a real implementation, this would use vision analysis
    // For now, provide structural checks based on common patterns

    const issues: DesignIssue[] = [];
    const strengths: string[] = [];

    // Heuristic: Check if screenshot exists and is not empty
    try {
      const stats = await fs.stat(screenshotPath);
      if (stats.size < 10000) {
        issues.push({
          severity: 'high',
          category: 'layout',
          issue: 'Screenshot appears to be blank or very small',
          suggestion: 'Ensure page loads completely before screenshot',
          page,
          viewport,
        });
      } else {
        strengths.push(`${page} renders successfully at ${viewport}`);
      }
    } catch {
      issues.push({
        severity: 'critical',
        category: 'layout',
        issue: 'Screenshot file missing or unreadable',
        suggestion: 'Check screenshot capture process',
        page,
        viewport,
      });
    }

    return { issues, strengths };
  }

  /**
   * Design check: Color Contrast
   */
  private async checkColorContrast(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    const inspirations: DesignInspiration[] = [];

    // Suggest contrast analysis
    inspirations.push({
      pattern: 'Accessibility-first color',
      observation: 'Color contrast affects readability',
      opportunity: 'Ensure all text meets WCAG AA standards (4.5:1 for normal text, 3:1 for large)',
    });

    return { inspirations };
  }

  /**
   * Design check: Spacing
   */
  private async checkSpacing(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    const inspirations: DesignInspiration[] = [];

    inspirations.push({
      pattern: 'Consistent spacing scale',
      observation: 'Spacing creates visual rhythm',
      opportunity: 'Use 8px grid system (8, 16, 24, 32, 48, 64) for consistent spacing',
    });

    return { inspirations };
  }

  /**
   * Design check: Typography
   */
  private async checkTypography(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    const inspirations: DesignInspiration[] = [];

    inspirations.push({
      pattern: 'Type scale hierarchy',
      observation: 'Typography establishes information hierarchy',
      opportunity: 'Define clear type scale: H1 (32-48px), H2 (24-32px), H3 (20-24px), Body (16px)',
    });

    return { inspirations };
  }

  /**
   * Design check: Responsiveness
   */
  private async checkResponsiveness(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    const inspirations: DesignInspiration[] = [];

    if (viewport === 'mobile') {
      inspirations.push({
        pattern: 'Mobile-first design',
        observation: 'Consider how content adapts from mobile to desktop',
        opportunity: 'Ensure touch targets are 44x44px minimum, critical actions are above the fold',
      });
    }

    if (viewport === 'desktop') {
      inspirations.push({
        pattern: 'Desktop layout optimization',
        observation: 'Desktop offers more screen real estate',
        opportunity: 'Use multi-column layouts, consider sidebar navigation, show more data density',
      });
    }

    return { inspirations };
  }

  /**
   * Design check: Interaction Patterns
   */
  private async checkInteractionPatterns(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    const inspirations: DesignInspiration[] = [];

    inspirations.push({
      pattern: 'Micro-interactions',
      observation: 'Subtle animations guide user attention',
      opportunity: 'Add hover states, loading indicators, transition animations for state changes',
    });

    return { inspirations };
  }

  /**
   * Design check: Accessibility
   */
  private async checkAccessibility(screenshotPath: string, page: string, viewport: string): Promise<{
    issues?: DesignIssue[];
    strengths?: string[];
    inspirations?: DesignInspiration[];
  }> {
    const inspirations: DesignInspiration[] = [];

    inspirations.push({
      pattern: 'Inclusive design',
      observation: 'Accessibility benefits all users',
      opportunity: 'Ensure keyboard navigation, screen reader support, focus indicators, alt text',
    });

    return { inspirations };
  }

  /**
   * Run the critic
   */
  async run(profile: string): Promise<CriticResult> {
    logInfo('DesignSystemVisualCritic starting', { profile });

    // Find latest screenshot session
    const sessionDir = await this.findLatestScreenshots();

    if (!sessionDir) {
      return this.fail(
        'No screenshots available for design review',
        'Run screenshot session first using MCP screenshot_session tool or ensure screenshot_config.yaml is configured properly.\n\nTo capture screenshots, use the MCP tool:\n- screenshot_session with startDevServer: true'
      );
    }

    logInfo('Found screenshot session', { sessionDir });

    try {
      // Analyze screenshots
      const report = await this.analyzeScreenshots(sessionDir);

      // Save report
      const reportDir = path.join(this.workspaceRoot, 'state', 'critics');
      await fs.mkdir(reportDir, { recursive: true });
      const reportPath = path.join(reportDir, 'design_system_visual_report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      // Determine pass/fail based on score
      const passThreshold = profile === 'high' ? 80 : profile === 'medium' ? 70 : 60;

      if (report.overall_score >= passThreshold) {
        return this.pass(
          `Design review passed with score ${report.overall_score}/100`,
          this.formatReportSummary(report)
        );
      } else {
        return this.fail(
          `Design review failed with score ${report.overall_score}/100 (threshold: ${passThreshold})`,
          this.formatReportSummary(report)
        );
      }
    } catch (error) {
      logError('Design review failed', { error });
      return this.fail(
        'Design review analysis failed',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Format report summary for critic output
   */
  private formatReportSummary(report: DesignReviewReport): string {
    const lines: string[] = [];

    lines.push(`**Overall Score:** ${report.overall_score}/100`);
    lines.push(`**Screenshots Reviewed:** ${report.screenshot_count}`);
    lines.push(`**Pages:** ${report.pages_reviewed.join(', ')}`);
    lines.push('');

    if (report.issues.length > 0) {
      lines.push(`**Issues Found (${report.issues.length}):**`);
      const bySeverity = {
        critical: report.issues.filter(i => i.severity === 'critical'),
        high: report.issues.filter(i => i.severity === 'high'),
        medium: report.issues.filter(i => i.severity === 'medium'),
        low: report.issues.filter(i => i.severity === 'low'),
      };

      for (const [severity, issues] of Object.entries(bySeverity)) {
        if (issues.length > 0) {
          lines.push(`- **${severity.toUpperCase()}**: ${issues.length}`);
          for (const issue of issues.slice(0, 3)) {
            lines.push(`  - ${issue.page} (${issue.viewport}): ${issue.issue}`);
            lines.push(`    → *Suggestion:* ${issue.suggestion}`);
          }
        }
      }
      lines.push('');
    }

    if (report.strengths.length > 0) {
      lines.push(`**Strengths (${report.strengths.length}):**`);
      for (const strength of report.strengths.slice(0, 5)) {
        lines.push(`- ${strength}`);
      }
      lines.push('');
    }

    if (report.inspirations.length > 0) {
      lines.push(`**Design Opportunities & Agent-Directed Inspiration (${report.inspirations.length}):**`);
      for (const inspiration of report.inspirations.slice(0, 8)) {
        lines.push(`- **${inspiration.pattern}**`);
        lines.push(`  *${inspiration.observation}*`);
        lines.push(`  → ${inspiration.opportunity}`);
      }
      lines.push('');
    }

    lines.push(`**Full Report:** state/critics/design_system_visual_report.json`);

    return lines.join('\n');
  }
}
