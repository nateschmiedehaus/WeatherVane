/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Phase 12: PROTOTYPE - Stigmergic Environment
 *
 * Core scent-based coordination mechanism for distributed layer patrol.
 * Implements indirect communication via environmental signals (stigmergy).
 */

export interface Scent {
  id: string;
  type: ScentType;
  strength: number; // 0.0 - 1.0
  decayRate: number; // Per hour
  timestamp: number;
  taskId: string;
  layer: LayerName;
  metadata: Record<string, any>;
}

export enum ScentType {
  // Layer 1: Constitutional
  QUALITY_APPROVED = 'quality_approved',
  QUALITY_CONCERN = 'quality_concern',

  // Layer 2: De-biasing
  OVERCONFIDENCE_DETECTED = 'overconfidence_detected',
  PRESENT_BIAS_DETECTED = 'present_bias_detected',

  // Layer 3: Detection
  BYPASS_PATTERN = 'bypass_pattern',
  QUALITY_TREND = 'quality_trend',

  // Layer 4: Remediation
  REMEDIATION_NEEDED = 'remediation_needed',
  REMEDIATION_CREATED = 'remediation_created',

  // Layer 5: Consensus
  CONSENSUS_REQUESTED = 'consensus_requested',
  CONSENSUS_ACHIEVED = 'consensus_achieved',

  // Layer 6: Documentation
  EVENT_LOGGED = 'event_logged',
  AUDIT_TRAIL_UPDATED = 'audit_trail_updated',

  // Bootstrap
  QUALITY_STANDARD = 'quality_standard',
  KNOWN_BYPASS = 'known_bypass'
}

export enum LayerName {
  L1_CONSTITUTIONAL = 'L1_CONSTITUTIONAL',
  L2_DEBIASING = 'L2_DEBIASING',
  L3_DETECTION = 'L3_DETECTION',
  L4_REMEDIATION = 'L4_REMEDIATION',
  L5_CONSENSUS = 'L5_CONSENSUS',
  L6_DOCUMENTATION = 'L6_DOCUMENTATION',
  BOOTSTRAP = 'BOOTSTRAP'
}

export interface ScentFilter {
  types?: ScentType[];
  taskId?: string;
  minStrength?: number;
  maxAge?: number; // Hours
}

/**
 * Stigmergic environment for scent-based coordination.
 * Layers leave scents, detect scents, react to scents - no direct communication.
 */
export class ScentEnvironment {
  private scents: Map<string, Scent> = new Map();
  private maxScents: number = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Auto-cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.updateScents();
    }, 3600000);
  }

  /**
   * Leave a scent in the environment.
   * Other layers will detect and react to this scent.
   */
  async leaveScent(scent: Omit<Scent, 'id' | 'timestamp'>): Promise<string> {
    const id = `scent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullScent: Scent = {
      id,
      timestamp: Date.now(),
      ...scent
    };

    this.scents.set(id, fullScent);

    // Prevent pollution
    if (this.scents.size > this.maxScents) {
      await this.pruneWeakestScents();
    }

    return id;
  }

  /**
   * Detect scents matching filter.
   * Returns scents with current (decayed) strength.
   */
  async detectScents(filter: ScentFilter = {}): Promise<Scent[]> {
    const now = Date.now();
    const results: Scent[] = [];

    for (const scent of this.scents.values()) {
      // Apply decay
      const ageHours = (now - scent.timestamp) / 3600000;
      const currentStrength = scent.strength * Math.exp(-scent.decayRate * ageHours);

      // Skip if decayed below threshold
      if (currentStrength < 0.01) continue;

      // Apply filters
      if (filter.types && !filter.types.includes(scent.type)) continue;
      if (filter.taskId && scent.taskId !== filter.taskId) continue;
      if (filter.minStrength && currentStrength < filter.minStrength) continue;
      if (filter.maxAge && ageHours > filter.maxAge) continue;

      results.push({ ...scent, strength: currentStrength });
    }

    return results.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Apply decay and remove dead scents.
   * Called automatically every hour.
   */
  async updateScents(): Promise<void> {
    const now = Date.now();
    const deadScents: string[] = [];

    for (const [id, scent] of this.scents.entries()) {
      const ageHours = (now - scent.timestamp) / 3600000;
      const currentStrength = scent.strength * Math.exp(-scent.decayRate * ageHours);

      if (currentStrength < 0.01) {
        deadScents.push(id);
      }
    }

    deadScents.forEach(id => this.scents.delete(id));
  }

  /**
   * Bootstrap with initial scents.
   * Seeds environment with quality standards and known bypass patterns.
   */
  async bootstrap(): Promise<void> {
    // Seed 1: Quality standards (permanent)
    await this.leaveScent({
      type: ScentType.QUALITY_STANDARD,
      strength: 1.0,
      decayRate: 0.0, // Never decays
      taskId: 'BOOTSTRAP',
      layer: LayerName.BOOTSTRAP,
      metadata: {
        minPhases: 10,
        minQualityScore: 95,
        maxLOC: 150,
        maxFiles: 5,
        minWordCount: 500
      }
    });

    // Seed 2: Known bypass patterns
    const bypassPatterns = [
      { pattern: 'BP001', desc: 'Partial phase completion' },
      { pattern: 'BP002', desc: 'Template evidence' },
      { pattern: 'BP003', desc: 'Speed over quality' },
      { pattern: 'BP004', desc: 'Skipping self-checks' },
      { pattern: 'BP005', desc: 'Claiming without proof' }
    ];

    for (const { pattern, desc } of bypassPatterns) {
      await this.leaveScent({
        type: ScentType.KNOWN_BYPASS,
        strength: 1.0,
        decayRate: 0.0,
        taskId: 'BOOTSTRAP',
        layer: LayerName.BOOTSTRAP,
        metadata: { pattern, description: desc }
      });
    }
  }

  /**
   * Measure layer utility (for via negativa).
   * Returns ratio of scents that triggered reactions from other layers.
   */
  async measureLayerUtility(layer: LayerName): Promise<number> {
    const scentsLeft = Array.from(this.scents.values()).filter(s => s.layer === layer);

    if (scentsLeft.length === 0) return 0.0;

    // Count how many scents from this layer triggered reactions
    let reactedTo = 0;
    for (const scent of scentsLeft) {
      // Check if any other layer left a scent referencing this one
      const reactions = Array.from(this.scents.values()).filter(s =>
        s.layer !== layer &&
        s.metadata?.triggeredBy === scent.id
      );
      if (reactions.length > 0) reactedTo++;
    }

    return reactedTo / scentsLeft.length;
  }

  /**
   * Prune weakest scents to prevent pollution.
   * Removes weakest 10% when max capacity reached.
   */
  private async pruneWeakestScents(): Promise<void> {
    const now = Date.now();
    const scentsWithStrength = Array.from(this.scents.entries()).map(([id, scent]) => {
      const ageHours = (now - scent.timestamp) / 3600000;
      const currentStrength = scent.strength * Math.exp(-scent.decayRate * ageHours);
      return { id, strength: currentStrength };
    });

    scentsWithStrength.sort((a, b) => a.strength - b.strength);

    // Remove weakest 10%
    const toRemove = Math.floor(scentsWithStrength.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.scents.delete(scentsWithStrength[i].id);
    }
  }

  /**
   * Get current scent count (for monitoring).
   */
  getScentCount(): number {
    return this.scents.size;
  }

  /**
   * Clear all scents (for testing).
   */
  clear(): void {
    this.scents.clear();
  }

  /**
   * Cleanup on shutdown.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
