/**
 * Episode Store — alive-mind  (Slice 3, v16 §25)
 *
 * Structured short-term memory keyed by MemoryKey (kind:source).
 * Bounded at MAX_EPISODES = 50; lowest-MVI entry is evicted on overflow.
 *
 * MVI lifecycle thresholds:
 *   mvi >= 0.20  → active   (healthy, eligible for LTG promotion)
 *   mvi <  0.20  → cooling  (low-value, still retained)
 *   mvi <  0.05  → pruned   (scheduled for removal by consolidator)
 *
 * API:
 *   record(episode)     — add new entry or update existing entry for same key
 *   recall(key)         — return episode + bump MVI by USAGE_WEIGHT
 *   decay(elapsed_ms)   — passive MVI decay across all entries
 *   getTop(n)           — highest-MVI episodes
 *   getEligible()       — non-pruned episodes (candidates for LTG)
 *   prune()             — remove pruned-lifecycle entries; returns count removed
 *   size()              — current entry count
 *
 * Do not add contradiction tracking, compression, or Symbol/Story memory.
 * Those are Slice 4+ concerns.
 */

import type { Episode, MemoryKey } from '../../../alive-constitution/contracts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_EPISODES       = 50;
const USAGE_WEIGHT       = 0.1;   // MVI increment on each recall
const DECAY_RATE         = 0.01;  // MVI units lost per second of elapsed time
const COOLING_THRESHOLD  = 0.20;  // below → cooling
const PRUNED_THRESHOLD   = 0.05;  // below → pruned

// ─── EpisodeStore ─────────────────────────────────────────────────────────────

export class EpisodeStore {
  private readonly episodes = new Map<MemoryKey, Episode>();

  // ── record ──────────────────────────────────────────────────────────────────

  /**
   * Add a new episode or update the existing entry for the same kind:source key.
   *
   * On update: bumps MVI by USAGE_WEIGHT, refreshes outcome / confidence /
   * trust_score / last_accessed, and recomputes lifecycle.
   * On insert: initialises mvi = 1.0, evicts lowest-MVI entry if at capacity.
   */
  record(episode: Episode): void {
    const key: MemoryKey = `${episode.kind}:${episode.source}`;
    const existing = this.episodes.get(key);

    if (existing) {
      const newMvi     = existing.mvi + USAGE_WEIGHT;
      const updated: Episode = {
        ...existing,
        signal_id:    episode.signal_id,
        outcome:      episode.outcome,
        confidence:   episode.confidence,
        trust_score:  episode.trust_score,
        mvi:          newMvi,
        last_accessed: Date.now(),
        lifecycle:    this._lifecycle(newMvi),
      };
      this.episodes.set(key, updated);
      console.log(
        `[EPISODE-STORE] UPDATE  key=${key}` +
        `  mvi=${updated.mvi.toFixed(3)}  lifecycle=${updated.lifecycle}`,
      );
    } else {
      if (this.episodes.size >= MAX_EPISODES) {
        this._evictLowest();
      }
      const fresh: Episode = {
        ...episode,
        mvi:          1.0,
        created_at:   episode.created_at > 0 ? episode.created_at : Date.now(),
        last_accessed: Date.now(),
        lifecycle:    'active',
      };
      this.episodes.set(key, fresh);
      console.log(
        `[EPISODE-STORE] INSERT  key=${key}` +
        `  mvi=${fresh.mvi.toFixed(3)}  lifecycle=${fresh.lifecycle}`,
      );
    }
  }

  // ── recall ───────────────────────────────────────────────────────────────────

  /**
   * Return the stored episode and increment its MVI by USAGE_WEIGHT.
   * Returns undefined when the key is not present.
   */
  recall(key: MemoryKey): Episode | undefined {
    const episode = this.episodes.get(key);
    if (!episode) return undefined;

    const newMvi = episode.mvi + USAGE_WEIGHT;
    const updated: Episode = {
      ...episode,
      mvi:          newMvi,
      last_accessed: Date.now(),
      lifecycle:    this._lifecycle(newMvi),
    };
    this.episodes.set(key, updated);
    return updated;
  }

  // ── decay ────────────────────────────────────────────────────────────────────

  /**
   * Apply passive MVI decay across all stored episodes.
   * mvi -= DECAY_RATE × (elapsed_ms / 1000)
   * Recomputes lifecycle for each entry after decrement.
   */
  decay(elapsed_ms: number): void {
    const decrement = DECAY_RATE * (elapsed_ms / 1000);
    let cooled = 0;
    let pruned = 0;

    for (const [key, episode] of this.episodes.entries()) {
      const newMvi   = Math.max(0, episode.mvi - decrement);
      const lifecycle = this._lifecycle(newMvi);
      if (lifecycle !== episode.lifecycle) {
        if (lifecycle === 'cooling') cooled++;
        if (lifecycle === 'pruned')  pruned++;
      }
      this.episodes.set(key, { ...episode, mvi: newMvi, lifecycle });
    }

    console.log(
      `[EPISODE-STORE] DECAY   elapsed=${(elapsed_ms / 1000).toFixed(2)}s` +
      `  decrement=${decrement.toFixed(5)}` +
      `  cooled=${cooled}  pruned=${pruned}  total=${this.episodes.size}`,
    );
  }

  // ── getTop ───────────────────────────────────────────────────────────────────

  /** Return the top N episodes sorted by MVI descending. */
  getTop(n: number): Episode[] {
    return [...this.episodes.values()]
      .sort((a, b) => b.mvi - a.mvi)
      .slice(0, n);
  }

  // ── getEligible ───────────────────────────────────────────────────────────────

  /**
   * Return all non-pruned episodes.
   * The LTG handles the mvi > 0.5 threshold; this returns the full candidate set.
   */
  getEligible(): Episode[] {
    return [...this.episodes.values()].filter(
      (e) => e.lifecycle !== 'pruned',
    );
  }

  // ── prune ────────────────────────────────────────────────────────────────────

  /** Remove all episodes in 'pruned' lifecycle state. Returns count removed. */
  prune(): number {
    let removed = 0;
    for (const [key, episode] of this.episodes.entries()) {
      if (episode.lifecycle === 'pruned') {
        this.episodes.delete(key);
        removed++;
        console.log(`[EPISODE-STORE] PRUNE   key=${key}  mvi=${episode.mvi.toFixed(3)}`);
      }
    }
    return removed;
  }

  // ── delete ───────────────────────────────────────────────────────────────────

  /** Remove a single episode by key. Used by consolidator after LTM promotion. */
  delete(key: MemoryKey): void {
    this.episodes.delete(key);
  }

  // ── size ─────────────────────────────────────────────────────────────────────

  size(): number {
    return this.episodes.size;
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  private _lifecycle(mvi: number): Episode['lifecycle'] {
    if (mvi < PRUNED_THRESHOLD)  return 'pruned';
    if (mvi < COOLING_THRESHOLD) return 'cooling';
    return 'active';
  }

  private _evictLowest(): void {
    let lowestKey: MemoryKey | undefined;
    let lowestMvi = Infinity;
    for (const [key, episode] of this.episodes.entries()) {
      if (episode.mvi < lowestMvi) {
        lowestMvi = episode.mvi;
        lowestKey = key;
      }
    }
    if (lowestKey !== undefined) {
      this.episodes.delete(lowestKey);
      console.log(
        `[EPISODE-STORE] EVICT   key=${lowestKey}  mvi=${lowestMvi.toFixed(3)}` +
        `  (capacity overflow)`,
      );
    }
  }
}

// ── Module singleton ──────────────────────────────────────────────────────────

export const episodeStore = new EpisodeStore();
