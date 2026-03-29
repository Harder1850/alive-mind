/**
 * Adversarial Reasoning Engine (ARE) — alive-mind
 * alive-mind/src/cognition/are.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 *
 * CONDITIONAL — fires only when candidate risk >= ARE_TRIGGER_THRESHOLD.
 * Challenges the dominant interpretation and produces confidence/risk adjustments.
 *
 * Slice 4 implementation.
 */

import type { Signal }          from '../../../alive-constitution/contracts/signal';
import type { ActionCandidate } from '../decisions/synthesize';

export interface AREChallenge {
  assumption:   string;
  alternative:  string;
  plausibility: number;
  risk_delta:   number;
}

export interface AREResult {
  fired:                       boolean;
  trigger_threshold?:          number;
  challenges:                  AREChallenge[];
  confidence_adjustment:       number;
  risk_adjustment:             number;
  recommend_safer_alternative: boolean;
  summary:                     string;
}

export const ARE_TRIGGER_THRESHOLD       = 0.40;
const SIGNIFICANT_CHALLENGE_THRESHOLD    = 0.5;

function challengeCpuSignal(signal: Signal, candidate: ActionCandidate): AREChallenge[] {
  const challenges: AREChallenge[] = [];
  const cpuRisk = signal.payload?.cpu_risk as number ?? 0;
  if (cpuRisk < 0.85) challenges.push({ assumption: 'High CPU requires immediate alert', alternative: 'CPU spike may be transient — wait one more cycle', plausibility: 0.6, risk_delta: -0.1 });
  if (candidate.action.type === 'write_file') challenges.push({ assumption: 'Writing to file is appropriate', alternative: 'Display in Studio — less I/O, same visibility', plausibility: 0.4, risk_delta: -0.05 });
  return challenges;
}

function challengeFileChangeSignal(signal: Signal): AREChallenge[] {
  const filePath = signal.payload?.file_path as string ?? '';
  if (filePath.includes('node_modules') || filePath.includes('.git')) {
    return [{ assumption: 'File change is significant', alternative: 'Build/dependency directory — likely routine noise', plausibility: 0.75, risk_delta: 0.0 }];
  }
  return [];
}

function challengeHighRisk(candidate: ActionCandidate): AREChallenge[] {
  const challenges: AREChallenge[] = [];
  if (candidate.risk > 0.6) challenges.push({ assumption: 'Current action is best available', alternative: 'More conservative action reduces irreversibility', plausibility: 0.5, risk_delta: 0.1 });
  if (candidate.source_memories.length === 0 && candidate.level !== 'rule') challenges.push({ assumption: 'Candidate is well-supported by memory', alternative: 'No memory evidence — confidence may be inflated', plausibility: 0.55, risk_delta: 0.05 });
  return challenges;
}

export function challenge(candidate: ActionCandidate, signal: Signal): AREResult {
  if (candidate.risk < ARE_TRIGGER_THRESHOLD) {
    return { fired: false, challenges: [], confidence_adjustment: 0, risk_adjustment: 0, recommend_safer_alternative: false, summary: `ARE not triggered (risk=${candidate.risk.toFixed(3)} < ${ARE_TRIGGER_THRESHOLD})` };
  }
  let challenges: AREChallenge[] = [];
  if (signal.kind === 'cpu_utilization')  challenges = [...challenges, ...challengeCpuSignal(signal, candidate)];
  if (signal.kind === 'file_change_event') challenges = [...challenges, ...challengeFileChangeSignal(signal)];
  challenges = [...challenges, ...challengeHighRisk(candidate)];
  if (challenges.length === 0) {
    return { fired: true, trigger_threshold: ARE_TRIGGER_THRESHOLD, challenges: [], confidence_adjustment: 0, risk_adjustment: 0, recommend_safer_alternative: false, summary: `ARE fired but found no strong alternatives` };
  }
  const significant            = challenges.filter(c => c.plausibility >= SIGNIFICANT_CHALLENGE_THRESHOLD);
  const confidence_adjustment  = significant.length > 0 ? -0.05 * significant.length : 0;
  const risk_adjustment        = significant.reduce((s, c) => s + c.plausibility * c.risk_delta, 0);
  const recommend_safer        = significant.some(c => c.risk_delta < 0);
  const summary                = significant.length > 0 ? `ARE: ${significant.length} challenge(s). confidence_adj=${confidence_adjustment.toFixed(3)}, risk_adj=${risk_adjustment.toFixed(3)}` : `ARE: ${challenges.length} weak challenge(s) — no significant alternatives`;
  return { fired: true, trigger_threshold: ARE_TRIGGER_THRESHOLD, challenges, confidence_adjustment, risk_adjustment, recommend_safer_alternative: recommend_safer, summary };
}
