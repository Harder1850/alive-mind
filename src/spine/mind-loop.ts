import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Decision } from '../../../alive-constitution/contracts/decision';
import { computeDecisionIntegrityHash } from '../../../alive-constitution/contracts/decision';

export class MindLoop {
  think(signal: Signal): Decision {
    return think(signal);
  }
}

export function think(signal: Signal): Decision {
  const text = signal.raw_content.toLowerCase().trim();

  let decision: Omit<Decision, 'integrity_hash'>;
  if (text.includes('hello')) {
    decision = {
      id: crypto.randomUUID(),
      selected_action: {
        type: 'display_text',
        payload: 'Hello from ALIVE.',
      },
      confidence: 0.9,
      admissibility_status: 'pending',
      reason: 'Matched greeting pattern.',
    };
  } else {
    decision = {
      id: crypto.randomUUID(),
      selected_action: {
        type: 'display_text',
        payload: `Received: ${signal.raw_content}`,
      },
      confidence: 0.6,
      admissibility_status: 'pending',
      reason: 'Default echo response for initial vertical slice.',
    };
  }

  // PATCH 2: Compute integrity hash immediately after decision creation
  const integrity_hash = computeDecisionIntegrityHash(decision);

  return {
    ...decision,
    integrity_hash,
  };
}
