/**
 * Procedure Library — alive-mind  (Slice 3, v16 §25)
 *
 * Stores learned action procedures keyed by MemoryKey (kind:source).
 * A procedure is a pairing of an Action with its observed success/failure
 * history.  When a procedure's failure rate reaches or exceeds the
 * FAILURE_RATE_THRESHOLD (0.4), it is demoted back to the episode store
 * with a reduced MVI so that the LTG can re-evaluate it from scratch.
 *
 * Slice 3 scope — simple counters only:
 *   record(key, action, outcome)  — create or update entry; demote on failure spike
 *   recall(key)                   — return procedure if failure rate < 0.4;
 *                                   demote and return undefined otherwise
 *   size()                        — active procedure count
 *
 * Do not add sequence tracking, conditional branching, or procedure chaining.
 * Those are future-slice concerns.
 */

import type { MemoryKey, Episode } from '../../../alive-constitution/contracts';
import type { Action }             from '../../../alive-constitution/contracts/action';
import { episodeStore }            from './episode-store';

// ─── Constants ────────────────────────────────────────────────────────────────

const FAILURE_RATE_THRESHOLD = 0.4;
const DEMOTED_MVI            = 0.3;  // low MVI — procedure needs re-evaluation

// ─── Procedure ────────────────────────────────────────────────────────────────

export interface Procedure {
  key:          MemoryKey;
  action:       Action;
  successCount: number;
  failureCount: number;
  created_at:   number;
  last_used:    number;
}

// ─── ProcedureLibrary ─────────────────────────────────────────────────────────

export class ProcedureLibrary {
  private readonly procedures = new Map<MemoryKey, Procedure>();

  // ── record ───────────────────────────────────────────────────────────────────

  /**
   * Record an execution outcome for the given key.
   * Creates a new procedure entry if none exists.
   * Demotes to the episode store if the post-update failure rate >= 0.4.
   */
  record(key: MemoryKey, action: Action, outcome: 'success' | 'failure'): void {
    const existing = this.procedures.get(key);

    if (existing) {
      const updated: Procedure = {
        ...existing,
        successCount: existing.successCount + (outcome === 'success' ? 1 : 0),
        failureCount: existing.failureCount + (outcome === 'failure' ? 1 : 0),
        last_used:    Date.now(),
      };
      this.procedures.set(key, updated);

      const fr = this._failureRate(updated);
      if (fr >= FAILURE_RATE_THRESHOLD) {
        this._demote(key, updated);
      } else {
        console.log(
          `[PROCEDURE-LIB] UPDATE  key=${key}` +
          `  success=${updated.successCount}  fail=${updated.failureCount}` +
          `  failRate=${fr.toFixed(2)}`,
        );
      }
    } else {
      const proc: Procedure = {
        key,
        action,
        successCount: outcome === 'success' ? 1 : 0,
        failureCount: outcome === 'failure' ? 1 : 0,
        created_at:   Date.now(),
        last_used:    Date.now(),
      };
      this.procedures.set(key, proc);

      const fr = this._failureRate(proc);
      console.log(
        `[PROCEDURE-LIB] INSERT  key=${key}` +
        `  success=${proc.successCount}  fail=${proc.failureCount}` +
        `  failRate=${fr.toFixed(2)}`,
      );

      // A brand-new entry with a first outcome of 'failure' is at 100% — demote.
      if (fr >= FAILURE_RATE_THRESHOLD) {
        this._demote(key, proc);
      }
    }
  }

  // ── recall ───────────────────────────────────────────────────────────────────

  /**
   * Return the procedure for the given key if its failure rate is below 0.4.
   * If the failure rate is at or above the threshold, demote the procedure and
   * return undefined so the caller falls back to the episode store.
   */
  recall(key: MemoryKey): Procedure | undefined {
    const proc = this.procedures.get(key);
    if (!proc) return undefined;

    const fr = this._failureRate(proc);
    if (fr >= FAILURE_RATE_THRESHOLD) {
      this._demote(key, proc);
      return undefined;
    }

    proc.last_used = Date.now();
    return proc;
  }

  // ── size ─────────────────────────────────────────────────────────────────────

  size(): number {
    return this.procedures.size;
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  private _failureRate(proc: Procedure): number {
    const total = proc.successCount + proc.failureCount;
    if (total === 0) return 0;
    return proc.failureCount / total;
  }

  private _demote(key: MemoryKey, proc: Procedure): void {
    this.procedures.delete(key);

    const fr = this._failureRate(proc);
    console.log(
      `[PROCEDURE-LIB] DEMOTE  key=${key}` +
      `  failRate=${fr.toFixed(2)} → episode store (mvi=${DEMOTED_MVI})`,
    );

    // Reconstruct kind and source from the key (first ':' separates them)
    const colonIdx = key.indexOf(':');
    const kind   = colonIdx >= 0 ? key.slice(0, colonIdx) : key;
    const source = colonIdx >= 0 ? key.slice(colonIdx + 1) : 'unknown';

    const demotedScore = Math.max(0, 1 - fr * 1.5);
    const episode: Episode = {
      id:           crypto.randomUUID(),
      kind,
      source,
      signal_id:    '',
      outcome:      `procedure demoted — failure rate ${fr.toFixed(2)}`,
      confidence:   demotedScore,
      mvi:          DEMOTED_MVI,
      created_at:   proc.created_at,
      last_accessed: Date.now(),
      lifecycle:    'cooling',
      trust_score:  demotedScore,
    };

    episodeStore.record(episode);
  }
}

// ── Module singleton ──────────────────────────────────────────────────────────

export const procedureLibrary = new ProcedureLibrary();
