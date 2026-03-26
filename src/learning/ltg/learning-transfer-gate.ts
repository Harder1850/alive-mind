import type { Story } from '../../memory/derived-memory';

const TRUST_THRESHOLD = 0.85;
const MVI_THRESHOLD = 0.7;

/**
 * Learning Transfer Gate.
 * Decides whether a Story from short-term working memory is ready
 * to be promoted to long-term memory (stories.json).
 *
 * Transfer criteria:
 *   - trust >= TRUST_THRESHOLD (high confidence from reinforcement)
 *   - mvi   >= MVI_THRESHOLD   (mission-value index shows importance)
 */
export class LearningTransferGate {
  shouldTransfer(entry: Story): boolean {
    return entry.trust >= TRUST_THRESHOLD && entry.mvi >= MVI_THRESHOLD;
  }
}

export const ltg = new LearningTransferGate();
