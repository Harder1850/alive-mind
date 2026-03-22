import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Decision } from '../../../alive-constitution/contracts/decision';

export function think(signal: Signal): Decision {
  const text = signal.raw_content.toLowerCase().trim();

  if (text.includes('hello')) {
    return {
      id: crypto.randomUUID(),
      selected_action: {
        type: 'display_text',
        payload: 'Hello from ALIVE.',
      },
      confidence: 0.9,
      admissibility_status: 'pending',
      reason: 'Matched greeting pattern.',
    };
  }

  return {
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
