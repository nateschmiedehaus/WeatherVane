/**
 * AFP-W0-AGENT-SELF-ENFORCEMENT-20251107-REMEDIATION-V
 * Layer 6: Documentation + Audit Trail
 *
 * Local Rules:
 * - IF any scent detected THEN log to audit trail
 * - THEN leave "event_logged" scent
 */

import { ScentEnvironment, ScentType, LayerName } from './scent_environment.js';
import * as fs from 'fs/promises';

export interface AuditEntry {
  timestamp: number;
  taskId: string;
  eventType: ScentType;
  layer: LayerName;
  metadata: any;
}

export class DocumentationLayer {
  private auditTrail: AuditEntry[] = [];

  constructor(private environment: ScentEnvironment) {}

  /**
   * Patrol scent environment and log all events.
   * Creates persistent audit trail.
   */
  async patrol(): Promise<void> {
    // Detect all scents (no filter)
    const allScents = await this.environment.detectScents({});

    // Check which ones we haven't logged yet
    const logged = await this.environment.detectScents({
      types: [ScentType.EVENT_LOGGED]
    });
    const loggedIds = new Set(logged.map(s => s.metadata.originalScentId));

    for (const scent of allScents) {
      if (loggedIds.has(scent.id)) continue;
      if (scent.type === ScentType.EVENT_LOGGED) continue; // Don't log logging events

      // Create audit entry
      const entry: AuditEntry = {
        timestamp: scent.timestamp,
        taskId: scent.taskId,
        eventType: scent.type,
        layer: scent.layer,
        metadata: scent.metadata
      };

      this.auditTrail.push(entry);

      // Leave logging scent
      await this.environment.leaveScent({
        type: ScentType.EVENT_LOGGED,
        strength: 0.5,
        decayRate: 0.9, // Decay fast (administrative)
        taskId: scent.taskId,
        layer: LayerName.L6_DOCUMENTATION,
        metadata: {
          originalScentId: scent.id,
          eventType: scent.type
        }
      });
    }
  }

  /**
   * Get complete audit trail.
   */
  getAuditTrail(): AuditEntry[] {
    return [...this.auditTrail];
  }

  /**
   * Persist audit trail to file.
   */
  async persist(path: string): Promise<void> {
    await fs.writeFile(path, JSON.stringify(this.auditTrail, null, 2));
  }

  /**
   * Load audit trail from file.
   */
  async load(path: string): Promise<void> {
    try {
      const content = await fs.readFile(path, 'utf-8');
      this.auditTrail = JSON.parse(content);
    } catch (err) {
      // File doesn't exist yet, start fresh
      this.auditTrail = [];
    }
  }
}
