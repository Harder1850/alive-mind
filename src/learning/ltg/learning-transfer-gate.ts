/**
 * Learning Transfer Gate (LTG) — alive-mind  (Slice 3, v16 §25)
 *
 * Evaluates whether an Episode from the STM (episode store) should be promoted
 * to the LTM (semantic graph).  All four conditions must pass for PROMOTE.
 *
 * Promotion conditions:
 *   1. significantDelta   — confidence > 0.6  (prediction was actionable)
 *   2. sufficientEvidence — mvi > 0.5          (episode has been reinforced)
 *   3. confidenceMet      — trust_score > 0.5  (execution trust is adequate)
 *   4. stable             — not in recentContradictions set
 *                           (Slice 3: always true — contradiction tracking is Slice 4)
 *
 * Slice 3 changes from Slice 1 stub:
 *   • Accepts Episode (alive-constitution/contracts/memory) instead of Story
 *   • Implements the four real conditions
 *   • recentContradictions is an empty Set — filled by Slice 4 contradiction engine
 *
 * Do not add:
 *   • Contradiction accumulation logic (Slice 4)
 *   • Calibration adjustment (Slice 4)
 *   • Decay of the contradictions set (Slice 4)
 */

import type { Episode } from '../../../../alive-constitution/contracts/memory';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LtgDecision = 'PROMOTE' | 'DEFER';

// ─── LearningTransferGate ─────────────────────────────────────────────────────

export class LearningTransferGate {
  /**
   * Episode IDs that have been contradicted recently.
   * Slice 3 stub: always empty.  Slice 4 will populate this via the
   * contradiction engine.
   */
  private readonly recentContradictions = new Set<string>();

  /**
   * Evaluate whether the episode qualifies for LTM promotion.
   * Returns 'PROMOTE' only when all four conditions pass; 'DEFER' otherwise.
   */
  evaluate(episode: Episode): LtgDecision {
    // Condition 1: prediction delta significant
    const significantDelta = episode.confidence > 0.6;

    // Condition 2: sufficient evidence
    const sufficientEvidence = episode.mvi > 0.5;

    // Condition 3: confidence threshold met
    const confidenceMet = episode.trust_score > 0.5;

    // Condition 4: belief stability — not contradicted recently
    const stable = !this.recentContradictions.has(episode.id);

    const shouldPromote =
      significantDelta && sufficientEvidence && confidenceMet && stable;

    console.log(
      `[LTG] id=${episode.id.slice(0, 8)}` +
      `  key=${episode.kind}:${episode.source}` +
      `  Δ=${significantDelta}(conf=${episode.confidence.toFixed(2)})` +
      `  ev=${sufficientEvidence}(mvi=${episode.mvi.toFixed(3)})` +
      `  thr=${confidenceMet}(trust=${episode.trust_score.toFixed(2)})` +
      `  stable=${stable}` +
      `  → ${shouldPromote ? 'PROMOTE' : 'DEFER'}`,
    );

    if (shouldPromote) {
      return 'PROMOTE';
    }
    return 'DEFER';
  }
}

// ── Module singleton ──────────────────────────────────────────────────────────

export const ltg = new LearningTransferGate();
