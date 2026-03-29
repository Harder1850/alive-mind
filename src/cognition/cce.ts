/**
 * Confidence & Contradiction Engine (CCE) — alive-mind
 * alive-mind/src/cognition/cce.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 *
 * Runs on every synthesis cycle with a candidate.
 * Scores confidence and evaluates suppression from ContradictionStore.
 *
 * Slice 4 implementation.
 */

import type { Signal }          from '../../../alive-constitution/contracts/signal';
import type { ActionCandidate } from '../decisions/synthesize';
import { evaluateSuppression, type SuppressionResult } from '../memory/contradiction-store';

export interface CCEInput {
  candidate:            ActionCandidate;
  signal:               Signal;
  prediction_accuracy?: number;
  evidence_count?:      number;
  source_trust?:        number;
}

export interface CCEResult {
  base_confidence:      number;
  adjusted_confidence:  number;
  suppression:          SuppressionResult;
  proceed:              boolean;
  reason:               string;
  factors: {
    base:                number;
    prediction_bonus:    number;
    evidence_bonus:      number;
    trust_modifier:      number;
    suppression_penalty: number;
  };
}

const EVIDENCE_SATURATION      = 20;
const MAX_EVIDENCE_BONUS        = 0.15;
const MAX_PREDICTION_BONUS      = 0.10;
const MIN_CONFIDENCE_TO_PROCEED = 0.30;

export function scoreCandidate(input: CCEInput): CCEResult {
  const { candidate, signal, prediction_accuracy = 0.5, evidence_count = 0, source_trust = candidate.confidence } = input;
  const base             = candidate.confidence;
  const prediction_bonus = Math.max(0, (prediction_accuracy - 0.5) * 2 * MAX_PREDICTION_BONUS);
  const evidence_ratio   = Math.min(1.0, evidence_count / EVIDENCE_SATURATION);
  const evidence_bonus   = evidence_ratio * MAX_EVIDENCE_BONUS;
  const trust_modifier   = 0.5 + (source_trust * 0.5);
  const suppression      = evaluateSuppression(signal, candidate.action.type);
  const suppression_penalty = suppression.total_pressure;
  const adjusted_confidence = Math.min(1.0, Math.max(0.0, base + (prediction_bonus + evidence_bonus) * trust_modifier - suppression_penalty));
  const proceed = !suppression.should_block && adjusted_confidence >= MIN_CONFIDENCE_TO_PROCEED;
  const reason  = suppression.should_block
    ? `Suppressed by ${suppression.votes.length} contradiction(s) (pressure=${suppression.total_pressure.toFixed(3)})`
    : adjusted_confidence < MIN_CONFIDENCE_TO_PROCEED
      ? `Confidence ${adjusted_confidence.toFixed(3)} below minimum`
      : `Confidence ${adjusted_confidence.toFixed(3)} — proceed`;
  return { base_confidence: base, adjusted_confidence, suppression, proceed, reason, factors: { base, prediction_bonus, evidence_bonus, trust_modifier, suppression_penalty } };
}
