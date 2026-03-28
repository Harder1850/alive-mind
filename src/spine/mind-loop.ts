import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Decision } from '../../../alive-constitution/contracts/decision';
import { computeDecisionIntegrityHash } from '../../../alive-constitution/contracts/decision';
import { synthesize } from '../decisions/synthesize';

export class MindLoop {
  think(signal: Signal): Decision {
    return think(signal);
  }
}

export function think(signal: Signal): Decision {
  const { candidate } = synthesize(signal);

  const base = {
    id:                  crypto.randomUUID(),
    selected_action:     candidate.action,
    confidence:          candidate.confidence,
    admissibility_status: 'pending' as const,
    reason:              candidate.reason,
  };

  const integrity_hash = computeDecisionIntegrityHash(base);

  return { ...base, integrity_hash };
}
