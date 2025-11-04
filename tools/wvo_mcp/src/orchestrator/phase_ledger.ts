/**
 * Immutable Phase Ledger with Hash Chaining
 *
 * Provides tamper-evident append-only log of phase transitions.
 * Each entry includes a hash of the previous entry, making the chain
 * cryptographically verifiable.
 *
 * Design:
 * - Append-only JSONL format at state/process/ledger.jsonl
 * - Hash chaining: each entry contains previous_hash
 * - Verification: compute hash chain from genesis to detect tampering
 * - Evidence linking: each phase transition records evidence artifacts
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { WorkPhase } from './work_process_enforcer.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';

/**
 * Phase ledger entry - immutable record of a phase transition
 */
export interface LedgerEntry {
  // Identity
  entry_id: string;          // UUID for this entry
  timestamp: string;         // ISO 8601 timestamp

  // Chain integrity
  previous_hash: string;     // Hash of previous entry (or 'genesis' for first)
  entry_hash: string;        // Hash of this entry (excluding entry_hash itself)

  // Phase transition
  task_id: string;
  from_phase: WorkPhase | null;
  to_phase: WorkPhase;

  // Evidence
  evidence_artifacts: string[];  // Paths to required artifacts
  evidence_validated: boolean;   // Did evidence pass validation?

  // Persona (IMP-22)
  persona_hash?: string;         // SHA-256 hash of PersonaSpec for this phase

  // Metadata
  agent_type?: string;           // Which agent executed the phase
  duration_ms?: number;          // Time spent in previous phase
}

/**
 * Verification result for ledger integrity
 */
export interface VerificationResult {
  valid: boolean;
  entries_checked: number;
  broken_chain_at?: number;     // Entry index where hash chain broke
  tampered_entries?: number[];  // Entries with invalid hashes
  error?: string;
}

/**
 * Immutable Phase Ledger
 *
 * Provides cryptographic proof of phase transitions.
 */
export class PhaseLedger {
  private readonly ledgerPath: string;
  private lastEntryHash: string = 'genesis';
  private entryCount: number = 0;

  constructor(
    private readonly workspaceRoot: string
  ) {
    this.ledgerPath = path.join(workspaceRoot, 'state/process/ledger.jsonl');
  }

  /**
   * Initialize ledger (create directory if needed)
   */
  async initialize(): Promise<void> {
    const ledgerDir = path.dirname(this.ledgerPath);
    try {
      await fs.mkdir(ledgerDir, { recursive: true });

      // If ledger exists, load last entry hash
      if (await this.exists()) {
        await this.loadLastEntryHash();
      }

      logInfo('Phase ledger initialized', {
        path: this.ledgerPath,
        exists: await this.exists(),
        lastHash: this.lastEntryHash
      });
    } catch (error) {
      logError('Failed to initialize phase ledger', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Check if ledger file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.ledgerPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load the hash of the last entry in the ledger
   */
  private async loadLastEntryHash(): Promise<void> {
    try {
      const content = await fs.readFile(this.ledgerPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      if (lines.length === 0) {
        this.lastEntryHash = 'genesis';
        this.entryCount = 0;
        return;
      }

      const lastLine = lines[lines.length - 1];
      const lastEntry: LedgerEntry = JSON.parse(lastLine);
      this.lastEntryHash = lastEntry.entry_hash;
      this.entryCount = lines.length;

      logInfo('Loaded last entry hash from ledger', {
        entryCount: this.entryCount,
        lastHash: this.lastEntryHash
      });
    } catch (error) {
      logWarning('Failed to load last entry hash, resetting to genesis', {
        error: error instanceof Error ? error.message : String(error)
      });
      this.lastEntryHash = 'genesis';
      this.entryCount = 0;
    }
  }

  /**
   * Append a phase transition to the ledger
   */
  async appendTransition(
    taskId: string,
    fromPhase: WorkPhase | null,
    toPhase: WorkPhase,
    evidenceArtifacts: string[],
    evidenceValidated: boolean,
    metadata?: {
      agentType?: string;
      durationMs?: number;
      personaHash?: string;  // IMP-22: Persona hash for this phase
    }
  ): Promise<LedgerEntry> {
    try {
      const entry: LedgerEntry = {
        entry_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        previous_hash: this.lastEntryHash,
        entry_hash: '', // Will be computed
        task_id: taskId,
        from_phase: fromPhase,
        to_phase: toPhase,
        evidence_artifacts: evidenceArtifacts,
        evidence_validated: evidenceValidated,
        persona_hash: metadata?.personaHash,  // IMP-22
        agent_type: metadata?.agentType,
        duration_ms: metadata?.durationMs
      };

      // Compute hash of entry (excluding entry_hash field)
      entry.entry_hash = this.computeEntryHash(entry);

      // Append to ledger file
      await fs.appendFile(
        this.ledgerPath,
        JSON.stringify(entry) + '\n'
      );

      // Update in-memory state
      this.lastEntryHash = entry.entry_hash;
      this.entryCount++;

      logInfo('Phase transition appended to ledger', {
        taskId,
        transition: `${fromPhase || 'START'} → ${toPhase}`,
        entryId: entry.entry_id,
        entryHash: entry.entry_hash,
        evidenceValidated
      });

      return entry;
    } catch (error) {
      logError('Failed to append transition to ledger', {
        taskId,
        transition: `${fromPhase} → ${toPhase}`,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Compute hash of a ledger entry
   */
  private computeEntryHash(entry: LedgerEntry): string {
    // Create canonical representation (excluding entry_hash)
    const canonical = {
      entry_id: entry.entry_id,
      timestamp: entry.timestamp,
      previous_hash: entry.previous_hash,
      task_id: entry.task_id,
      from_phase: entry.from_phase,
      to_phase: entry.to_phase,
      evidence_artifacts: entry.evidence_artifacts,
      evidence_validated: entry.evidence_validated,
      agent_type: entry.agent_type,
      duration_ms: entry.duration_ms
    };

    const canonicalJson = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Verify the integrity of the entire ledger
   *
   * Checks:
   * 1. Hash chain is unbroken (each previous_hash matches previous entry's entry_hash)
   * 2. Entry hashes are valid (recompute and compare)
   * 3. No gaps or tampering in the sequence
   */
  async verify(): Promise<VerificationResult> {
    try {
      if (!await this.exists()) {
        return {
          valid: true,
          entries_checked: 0
        };
      }

      const content = await fs.readFile(this.ledgerPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      if (lines.length === 0) {
        return {
          valid: true,
          entries_checked: 0
        };
      }

      let previousHash = 'genesis';
      const tamperedEntries: number[] = [];
      let brokenChainAt: number | undefined;

      for (let i = 0; i < lines.length; i++) {
        const entry: LedgerEntry = JSON.parse(lines[i]);

        // Check 1: Previous hash matches
        if (entry.previous_hash !== previousHash) {
          brokenChainAt = i;
          logError('Hash chain broken at entry', {
            entryIndex: i,
            entryId: entry.entry_id,
            expectedPreviousHash: previousHash,
            actualPreviousHash: entry.previous_hash
          });
          break;
        }

        // Check 2: Entry hash is valid
        const expectedHash = this.computeEntryHash(entry);
        if (entry.entry_hash !== expectedHash) {
          tamperedEntries.push(i);
          logError('Entry hash mismatch (possible tampering)', {
            entryIndex: i,
            entryId: entry.entry_id,
            expectedHash,
            actualHash: entry.entry_hash
          });
        }

        previousHash = entry.entry_hash;
      }

      const result: VerificationResult = {
        valid: brokenChainAt === undefined && tamperedEntries.length === 0,
        entries_checked: lines.length,
        broken_chain_at: brokenChainAt,
        tampered_entries: tamperedEntries.length > 0 ? tamperedEntries : undefined
      };

      if (result.valid) {
        logInfo('Ledger verification passed', { entries_checked: lines.length });
      } else {
        logError('Ledger verification FAILED', {
          valid: result.valid,
          entries_checked: result.entries_checked,
          broken_chain_at: result.broken_chain_at,
          tampered_entries: result.tampered_entries
        });
      }

      return result;
    } catch (error) {
      logError('Ledger verification error', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        valid: false,
        entries_checked: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get all ledger entries for a specific task
   */
  async getTaskHistory(taskId: string): Promise<LedgerEntry[]> {
    try {
      if (!await this.exists()) {
        return [];
      }

      const content = await fs.readFile(this.ledgerPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      return lines
        .map(line => JSON.parse(line) as LedgerEntry)
        .filter(entry => entry.task_id === taskId);
    } catch (error) {
      logError('Failed to get task history from ledger', {
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Get the current phase for a task based on ledger history
   */
  async getCurrentPhase(taskId: string): Promise<WorkPhase | null> {
    const history = await this.getTaskHistory(taskId);
    if (history.length === 0) {
      return null;
    }

    // Return the to_phase of the most recent entry
    return history[history.length - 1].to_phase;
  }

  /**
   * Get ledger statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    uniqueTasks: number;
    oldestEntry?: string;
    newestEntry?: string;
    lastHash: string;
  }> {
    try {
      if (!await this.exists()) {
        return {
          totalEntries: 0,
          uniqueTasks: 0,
          lastHash: 'genesis'
        };
      }

      const content = await fs.readFile(this.ledgerPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      if (lines.length === 0) {
        return {
          totalEntries: 0,
          uniqueTasks: 0,
          lastHash: 'genesis'
        };
      }

      const entries = lines.map(line => JSON.parse(line) as LedgerEntry);
      const uniqueTasks = new Set(entries.map(e => e.task_id)).size;

      return {
        totalEntries: entries.length,
        uniqueTasks,
        oldestEntry: entries[0].timestamp,
        newestEntry: entries[entries.length - 1].timestamp,
        lastHash: entries[entries.length - 1].entry_hash
      };
    } catch (error) {
      logError('Failed to get ledger stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        totalEntries: 0,
        uniqueTasks: 0,
        lastHash: 'genesis'
      };
    }
  }
}
