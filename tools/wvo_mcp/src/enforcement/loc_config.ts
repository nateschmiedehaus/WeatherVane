/**
 * LOC Enforcement Configuration
 *
 * Centralized, tunable parameters for smart LOC enforcement.
 * Adjust these based on analytics and agent feedback.
 */

export interface LOCConfig {
  baseLimit: number;
  fileTypeMultipliers: Record<string, number>;
  patternBonuses: Record<string, number>;
  severityThresholds: {
    warning: number; // % over limit
    strongWarning: number;
    blocked: number;
  };
  deletionCreditRatio: number; // credit per line deleted
  effectiveLOCEnabled: boolean;
}

export const DEFAULT_LOC_CONFIG: LOCConfig = {
  // Base limit for all files
  baseLimit: 150,

  // File type multipliers (applied to base limit)
  fileTypeMultipliers: {
    test: 3.0, // Tests can be comprehensive
    template: 4.0, // Templates are naturally verbose with examples
    'system-docs': 4.0, // System/architecture docs can be comprehensive
    docs: 3.0, // Documentation completeness valued
    guide: 3.0, // Same as docs
    types: 1.5, // Type definitions are verbose but structured
    scripts: 1.5, // Automation can be complex
    config: 1.3, // Config files moderate
    evidence: 2.5, // Evidence documentation
    core: 0.8, // Core logic STRICTER than default
    default: 1.0, // Standard enforcement
  },

  // Pattern bonuses (added to adjusted limit)
  patternBonuses: {
    'high-imports': 20, // Module integration, not logic complexity
    'well-documented': 30, // Good documentation encouraged
    'type-heavy': 25, // Type safety encouraged
    'readable-spacing': 10, // Readability encouraged
  },

  // Progressive enforcement thresholds
  severityThresholds: {
    warning: 1.5, // 150% over limit → warning
    strongWarning: 2.0, // 200% over limit → strong warning
    blocked: 2.0, // >200% over limit → blocked
  },

  // Deletion credit system (via negativa incentive)
  deletionCreditRatio: 0.5, // For every 2 lines deleted, get 1 line credit

  // Enable effective LOC calculation (excluding boilerplate)
  effectiveLOCEnabled: true,
};

/**
 * Get config from environment or use defaults
 */
export function getLOCConfig(): LOCConfig {
  // For now, just return defaults
  // Future: could read from config file or environment variables
  return DEFAULT_LOC_CONFIG;
}
