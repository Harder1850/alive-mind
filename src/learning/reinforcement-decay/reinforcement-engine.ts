/**
 * Reinforcement Engine — alive-mind
 * src/learning/reinforcement-decay/reinforcement-engine.ts
 *
 * Adjusts trust scores on memory entries based on outcome feedback.
 * reinforce() is called when an entry's action produced a good outcome.
 * decay()     is called for entries that were considered but not selected.
 * decayAll()  is called after a reasoning cycle to age out unused entries.
 *
 * Migration from original:
 *   The original implementation read/wrote `stories.json` directly via
 *   readFileSync/writeFileSync. This created FS side effects inside alive-mind,
 *   which violates the no-world-execution-side-effects rule for cognition.
 *
 *   This version introduces a `ReinforcementStore` interface so storage is
 *   injected. `InMemoryReinforcementStore` is the default in-process store.
 *   Callers that need persistence should inject a store backed by their own
 *   persistence layer (outside alive-mind).
 *
 * Migration note:
 *   The original `reinforcement` singleton used stories.json. That file is still
 *   present in the repo (memory/stories.json) and is used by derived-memory.ts.
 *   That path (reasoning-engine.ts → derived-memory.ts) is preserved as-is.
 *   The new ReinforcementEngine operates on a separate in-memory store unless
 *   a custom store is injected.
 *
 * Design rules:
 *   - No FS imports in this file.
 *   - Storage is fully injected — the engine is side-effect free.
 *   - Clamp to [floor, ceiling] is deterministic.
 *   - Trust floor prevents permanent suppression from a single bad outcome.
 */

// ── Store interface ────────────────────────────────────────────────────────────

/** A memory entry that carries a trust score subject to reinforcement. */
export interface ReinforcableEntry {
  id:    string;
  trust: number;
}

/**
 * Storage backend for the reinforcement engine.
 * Implement this to back the engine with any persistence layer.
 * The default is InMemoryReinforcementStore (ephemeral, no disk I/O).
 */
export interface ReinforcementStore {
  get(id: string): ReinforcableEntry | undefined;
  set(entry: ReinforcableEntry): void;
  listAll(): ReinforcableEntry[];
}

// ── In-memory store ────────────────────────────────────────────────────────────

export class InMemoryReinforcementStore implements ReinforcementStore {
  private readonly entries = new Map<string, ReinforcableEntry>();

  get(id: string): ReinforcableEntry | undefined {
    return this.entries.get(id);
  }

  set(entry: ReinforcableEntry): void {
    this.entries.set(entry.id, { ...entry });
  }

  listAll(): ReinforcableEntry[] {
    return [...this.entries.values()];
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TRUST_FLOOR   = 0.10;
const TRUST_CEILING = 1.00;
const DECAY_RATE    = 0.02;

// ── Engine ─────────────────────────────────────────────────────────────────────

export class ReinforcementEngine {
  private readonly store: ReinforcementStore;

  constructor(store?: ReinforcementStore) {
    this.store = store ?? new InMemoryReinforcementStore();
  }

  /**
   * Reinforce an entry by id. delta > 0 increases trust, delta < 0 decreases.
   * Clamps result to [TRUST_FLOOR, TRUST_CEILING].
   * No-op if entry is not found.
   */
  reinforce(id: string, delta: number): void {
    const entry = this.store.get(id);
    if (!entry) {
      console.warn(`[ReinforcementEngine] Entry not found for reinforce: ${id}`);
      return;
    }
    const updated: ReinforcableEntry = {
      id,
      trust: Math.min(TRUST_CEILING, Math.max(TRUST_FLOOR, entry.trust + delta)),
    };
    this.store.set(updated);
  }

  /**
   * Decay an entry's trust by DECAY_RATE.
   * Called for entries that were considered but not selected (outcompeted).
   */
  decay(id: string): void {
    this.reinforce(id, -DECAY_RATE);
  }

  /**
   * Register an entry if it doesn't exist yet.
   * Idempotent — subsequent calls are no-ops.
   */
  register(entry: ReinforcableEntry): void {
    if (!this.store.get(entry.id)) {
      this.store.set(entry);
    }
  }

  /**
   * Decay all entries not in the keepIds set.
   * Call after a reasoning cycle to age out unused entries.
   */
  decayAll(keepIds: Set<string>): void {
    for (const entry of this.store.listAll()) {
      if (!keepIds.has(entry.id)) {
        this.reinforce(entry.id, -DECAY_RATE);
      }
    }
  }

  /**
   * Read an entry's current trust score.
   * Returns undefined if not registered.
   */
  getTrust(id: string): number | undefined {
    return this.store.get(id)?.trust;
  }

  /**
   * List all entries. Used for snapshot/audit.
   */
  listAll(): ReinforcableEntry[] {
    return this.store.listAll();
  }
}

// ── Module-level singleton (default in-memory store) ──────────────────────────

export const reinforcement = new ReinforcementEngine();
