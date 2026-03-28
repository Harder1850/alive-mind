/**
 * Learning Transfer Gate (LTG) — alive-mind.
 *
 * Decides whether a Story from short-term working memory should be
 * promoted to long-term memory (stories.json).
 *
 * Return type:
 *   'PROMOTE' — story meets criteria for LTM transfer
 *   'DEFER'   — story does not yet qualify; retain in STM
 *
 * Slice 1 stub: always returns DEFER.
 * Full implementation (trust + MVI thresholds) is gated on Slice 2 LTM work.
 */

import type { Story } from '../../memory/derived-memory';

export type LtgDecision = 'PROMOTE' | 'DEFER';

export class LearningTransferGate {
  /** Slice 1 stub — returns DEFER unconditionally. */
  evaluate(_entry: Story): LtgDecision {
    return 'DEFER';
  }
}

export const ltg = new LearningTransferGate();
