/**
 * Consolidator — alive-mind  (Slice 3, v16 §25)
 *
 * Background memory maintenance.  Intended to run every 50 cognitive cycles
 * (not on every cycle — see alive-runtime/src/wiring/slice1-cycle.ts).
 *
 * Each run performs three operations in order:
 *   1. Decay   — apply elapsed-time MVI decay to all episodes in the store
 *   2. Promote — pass every non-pruned episode through the LTG; call
 *                semanticGraph.promote() for those that return 'PROMOTE'
 *   3. Prune   — remove all episodes whose lifecycle has reached 'pruned'
 *
 * The consolidator does NOT:
 *   • Run on every cognitive cycle (caller responsibility)
 *   • Handle contradictions (Slice 4)
 *   • Compress or archive episodes (Slice 4+)
 *   • Remove episodes from the store after promotion — they remain in STM
 *     until they decay below the pruned threshold or are evicted by overflow
 */

import { episodeStore }  from './episode-store';
import { semanticGraph } from './semantic-graph';
import { ltg }           from '../learning/ltg/learning-transfer-gate';
import { decayAll as decayContradictions } from './contradiction-store';

// ─── Consolidator ─────────────────────────────────────────────────────────────

export class Consolidator {
  private lastRunAt = Date.now();

  /**
   * Execute one consolidation pass.
   * Safe to call at any time; elapsed time is computed internally.
   */
  run(): void {
    const now     = Date.now();
    const elapsed = now - this.lastRunAt;
    this.lastRunAt = now;

    console.log(
      `[CONSOLIDATOR] START  elapsed_since_last=${(elapsed / 1000).toFixed(2)}s` +
      `  episodes=${episodeStore.size()}  semanticNodes=${semanticGraph.size()}`,
    );

    // ── Step 1: Decay ────────────────────────────────────────────────────────
    episodeStore.decay(elapsed);
    decayContradictions();

    // ── Step 2: Promote eligible episodes via LTG ────────────────────────────
    const candidates = episodeStore.getEligible();
    let promoted = 0;

    for (const episode of candidates) {
      const verdict = ltg.evaluate(episode);
      if (verdict === 'PROMOTE') {
        semanticGraph.promote(episode);
        promoted++;
      }
    }

    // ── Step 3: Prune expired episodes ───────────────────────────────────────
    const pruned = episodeStore.prune();

    console.log(
      `[CONSOLIDATOR] DONE   candidates=${candidates.length}` +
      `  promoted=${promoted}  pruned=${pruned}` +
      `  episodes=${episodeStore.size()}  semanticNodes=${semanticGraph.size()}`,
    );
  }
}

// ── Module singleton ──────────────────────────────────────────────────────────

export const consolidator = new Consolidator();
