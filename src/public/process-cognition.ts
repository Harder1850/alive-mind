import type { MindInput, MindOutput } from '../contracts/cycle';
import { think } from '../core/mind-loop';

export function processCognition(input: MindInput): MindOutput {
  const signal = { id: `sig-${input.timestamp}`, kind: 'user_input', source: input.source ?? 'interface', timestamp: input.timestamp, raw_content: input.signalText, confidence: 0.6, urgency: 0.4, quality_score: 0.7, payload: null, threat_flag: false } as any;
  const decision = think(signal);
  return { summary: decision.reason, decision: { id: decision.id, candidateType: decision.selected_action.type, rationale: decision.reason, confidence: decision.confidence }, notes: [] };
}
