/**
 * QualityTrends Analyzer
 *
 * Tracks quality scores over time, identifies patterns, and provides
 * insights for continuous improvement.
 */

import { StateMachine } from './state_machine.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import Database from 'better-sqlite3';
import path from 'path';

export interface QualityScore {
  taskId: string;
  score: number;
  timestamp: number;
  agentType: string;
  category: 'code' | 'test' | 'docs' | 'review' | 'other';
  metadata?: Record<string, any>;
}

export interface TrendAnalysis {
  period: 'hourly' | 'daily' | 'weekly';
  startTime: number;
  endTime: number;
  averageScore: number;
  medianScore: number;
  trend: 'improving' | 'stable' | 'degrading';
  trendSlope: number;
  sampleCount: number;
  categories: Record<string, number>;
}

export interface QualityAlert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  suggestions: string[];
}

export class QualityTrendsAnalyzer {
  private db!: Database.Database;
  private readonly DEGRADATION_THRESHOLD = 0.1; // 10% drop triggers alert
  private readonly MIN_SAMPLES_FOR_TREND = 10;
  private readonly TREND_WINDOW_DAYS = 7;
  private readonly OUTLIER_THRESHOLD = 2; // 2 standard deviations

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string
  ) {
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const dbPath = path.join(this.workspaceRoot, 'state', 'orchestrator.db');
    this.db = new Database(dbPath);

    // Create quality_trends table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quality_trends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        score REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        agent_type TEXT NOT NULL,
        category TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_quality_trends_timestamp
        ON quality_trends(timestamp);
      CREATE INDEX IF NOT EXISTS idx_quality_trends_category
        ON quality_trends(category);
      CREATE INDEX IF NOT EXISTS idx_quality_trends_agent
        ON quality_trends(agent_type);
    `);

    logInfo('QualityTrends database initialized');
  }

  /**
   * Record a quality score for trend analysis
   */
  async recordScore(score: QualityScore): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO quality_trends
        (task_id, score, timestamp, agent_type, category, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        score.taskId,
        score.score,
        score.timestamp,
        score.agentType,
        score.category,
        score.metadata ? JSON.stringify(score.metadata) : null
      );

      logInfo('Quality score recorded', {
        taskId: score.taskId,
        score: score.score,
        category: score.category
      });

      // Check for degradation after recording
      await this.checkForDegradation();

    } catch (error) {
      logError('Failed to record quality score', { error: String(error) });
      throw error;
    }
  }

  /**
   * Analyze trends over a specified period
   */
  async analyzeTrends(period: 'hourly' | 'daily' | 'weekly' = 'daily'): Promise<TrendAnalysis> {
    const now = Date.now();
    let startTime: number;

    switch (period) {
      case 'hourly':
        startTime = now - (60 * 60 * 1000);
        break;
      case 'daily':
        startTime = now - (24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
    }

    // Get scores within period
    const scores = this.db.prepare(`
      SELECT score, category, agent_type
      FROM quality_trends
      WHERE timestamp >= ?
      ORDER BY timestamp DESC
    `).all(startTime) as Array<{ score: number; category: string; agent_type: string }>;

    if (scores.length === 0) {
      return {
        period,
        startTime,
        endTime: now,
        averageScore: 0,
        medianScore: 0,
        trend: 'stable',
        trendSlope: 0,
        sampleCount: 0,
        categories: {}
      };
    }

    // Calculate statistics
    const scoreValues = scores.map(s => s.score);
    const average = this.calculateAverage(scoreValues);
    const median = this.calculateMedian(scoreValues);
    const trend = this.calculateTrend(scoreValues);

    // Category breakdown
    const categories: Record<string, number> = {};
    for (const score of scores) {
      categories[score.category] = (categories[score.category] || 0) + 1;
    }

    return {
      period,
      startTime,
      endTime: now,
      averageScore: average,
      medianScore: median,
      trend: trend.direction,
      trendSlope: trend.slope,
      sampleCount: scores.length,
      categories
    };
  }

  /**
   * Check for quality degradation and generate alerts
   */
  async checkForDegradation(): Promise<QualityAlert[]> {
    const alerts: QualityAlert[] = [];

    // Compare last 24 hours to previous 24 hours
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const twoDaysAgo = now - (48 * 60 * 60 * 1000);

    const recentScores = this.getScoresInRange(oneDayAgo, now);
    const previousScores = this.getScoresInRange(twoDaysAgo, oneDayAgo);

    if (recentScores.length < this.MIN_SAMPLES_FOR_TREND ||
        previousScores.length < this.MIN_SAMPLES_FOR_TREND) {
      return alerts; // Not enough data
    }

    const recentAvg = this.calculateAverage(recentScores);
    const previousAvg = this.calculateAverage(previousScores);
    const degradation = (previousAvg - recentAvg) / previousAvg;

    if (degradation > this.DEGRADATION_THRESHOLD) {
      alerts.push({
        severity: degradation > 0.2 ? 'critical' : 'warning',
        message: `Quality degradation detected: ${(degradation * 100).toFixed(1)}% drop`,
        metric: 'average_quality_score',
        currentValue: recentAvg,
        threshold: previousAvg * (1 - this.DEGRADATION_THRESHOLD),
        suggestions: this.generateImprovementSuggestions(recentAvg, degradation)
      });

      logWarning('Quality degradation detected', {
        degradation: `${(degradation * 100).toFixed(1)}%`,
        previousAvg,
        recentAvg
      });
    }

    return alerts;
  }

  /**
   * Generate improvement suggestions based on trends
   */
  generateImprovementSuggestions(currentScore: number, degradation: number): string[] {
    const suggestions: string[] = [];

    if (currentScore < 0.7) {
      suggestions.push('Consider adding more comprehensive tests');
      suggestions.push('Review and improve code documentation');
      suggestions.push('Increase code review thoroughness');
    }

    if (degradation > 0.15) {
      suggestions.push('Recent changes may have introduced issues - review last commits');
      suggestions.push('Consider reverting recent problematic changes');
      suggestions.push('Increase quality gate thresholds');
    }

    // Category-specific suggestions
    const categoryTrends = this.getCategoryTrends();
    for (const [category, trend] of Object.entries(categoryTrends)) {
      if (trend < -0.1) { // Degrading category
        switch (category) {
          case 'code':
            suggestions.push('Code quality declining - run additional linting');
            break;
          case 'test':
            suggestions.push('Test quality declining - review test coverage');
            break;
          case 'docs':
            suggestions.push('Documentation quality declining - update docs');
            break;
        }
      }
    }

    return suggestions;
  }

  /**
   * Get historical quality data for visualization
   */
  async getHistoricalData(days: number = 7): Promise<Array<{ timestamp: number; score: number; category: string }>> {
    const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    const data = this.db.prepare(`
      SELECT timestamp, score, category
      FROM quality_trends
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(startTime) as Array<{ timestamp: number; score: number; category: string }>;

    return data;
  }

  /**
   * Filter outliers from score data
   */
  private filterOutliers(scores: number[]): number[] {
    if (scores.length < 3) return scores;

    const mean = this.calculateAverage(scores);
    const stdDev = this.calculateStandardDeviation(scores, mean);

    return scores.filter(score =>
      Math.abs(score - mean) <= this.OUTLIER_THRESHOLD * stdDev
    );
  }

  /**
   * Calculate trend direction and slope
   */
  private calculateTrend(scores: number[]): { direction: 'improving' | 'stable' | 'degrading'; slope: number } {
    if (scores.length < 2) {
      return { direction: 'stable', slope: 0 };
    }

    // Simple linear regression
    const n = scores.length;
    const indices = Array.from({ length: n }, (_, i) => i);

    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = scores.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((sum, x, i) => sum + x * scores[i], 0);
    const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Determine direction based on slope
    const direction = slope > 0.01 ? 'improving' :
                     slope < -0.01 ? 'degrading' : 'stable';

    return { direction, slope };
  }

  /**
   * Get scores within a time range
   */
  private getScoresInRange(startTime: number, endTime: number): number[] {
    const scores = this.db.prepare(`
      SELECT score FROM quality_trends
      WHERE timestamp >= ? AND timestamp <= ?
    `).all(startTime, endTime) as Array<{ score: number }>;

    return scores.map(s => s.score);
  }

  /**
   * Get trends by category
   */
  private getCategoryTrends(): Record<string, number> {
    const trends: Record<string, number> = {};
    const categories = ['code', 'test', 'docs', 'review', 'other'];

    for (const category of categories) {
      const scores = this.db.prepare(`
        SELECT score FROM quality_trends
        WHERE category = ?
        AND timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT 20
      `).all(category, Date.now() - (7 * 24 * 60 * 60 * 1000)) as Array<{ score: number }>;

      if (scores.length >= 2) {
        const scoreValues = scores.map(s => s.score);
        const trend = this.calculateTrend(scoreValues);
        trends[category] = trend.slope;
      }
    }

    return trends;
  }

  /**
   * Calculate average of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  /**
   * Calculate median of numbers
   */
  private calculateMedian(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(numbers: number[], mean?: number): number {
    if (numbers.length === 0) return 0;
    const avg = mean ?? this.calculateAverage(numbers);
    const squareDiffs = numbers.map(n => Math.pow(n - avg, 2));
    return Math.sqrt(this.calculateAverage(squareDiffs));
  }

  /**
   * Clean up old trend data
   */
  async pruneOldData(daysToKeep: number = 30): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

    const result = this.db.prepare(`
      DELETE FROM quality_trends
      WHERE timestamp < ?
    `).run(cutoffTime);

    logInfo(`Pruned ${result.changes} old quality trend records`);
    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}