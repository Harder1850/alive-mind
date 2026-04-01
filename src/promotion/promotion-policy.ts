/**
 * Promotion Policy — alive-mind
 * src/promotion/promotion-policy.ts
 *
 * Decides whether an episode in STM should be promoted to LTM.
 * Wraps the LearningTransferGate with a richer context interface so that
 * contradiction pressure and cycle metadata are available at promotion time.
 *
 * Architecture:
 *   LearningTransferGate (src/learning/ltg/) implements the four raw conditions:
 *     1. significantDelta   — confidence > 0.6
 *     2. sufficientEvidence — mvi > 0.5
 *     3. confidenceMet      — trust_score > 0.5
 *     4. stable             — not recently contradicted
 *
 *   PromotionPolicy wraps these with:
 *     - contradiction pressure injection (from CCE/contradiction-store)
 *     - cooldown enforcement (episodes cannot be re-evaluated immediately)
 *     - budget awareness (promotion batch size is bounded)
 *     - full PromotionDecision output (not just PROMOTE/DEFER)
 *
 * Doctrine-sensitive items intentionally not finalized:
 *   - exact cooldown duration
 *   - batch size and promotion frequency
 *   - how contradiction pressure modifies the four LTG conditions
 *   - seeded vs injected vs learned trust resolution
 *
 * Migration note:
 *   LTG was a standalone class with no context injection.
 *   This module is the migration target that adds context-aware wrapping.
 *   LTG continues to work unchanged — this layer adds the richer interface.
 */

import type { Episode } from '../../../../alive-constitution/contracts/memory';
import { LearningTransferGate, type LtgDecision } from '../learning/ltg/learning-transfer-gate';
import type { Contradiction } from '../memory/contradiction-store';

// ── Config ─────────────────────────────────────────────────────────────────────

/**
 * Doctrine-sensitive thresholds for promotion gating.
 * All defaults are conservative starting points — NOT finalized policy.
 *
 * TODO(doctrine): cooldown duration from reinforcement schedule
 * TODO(doctrine): batch limits from memory budget formulas
 * TODO(doctrine): contradiction pressure integration into LTG conditions
 */
export interface PromotionConfig {
  /**
   * Minimum ms since an episode was created before it is eligible for promotion.
   * Default 30_000ms (30 seconds). Prevents promoting immediately-created episodes.
   * TODO(doctrine): not finalized — depends on cycle cadence.
   */
  minAgeMs: number;

  /**
   * Maximum episodes to promote in a single batch call.
   * Default 5.
   * TODO(doctrine): depends on LTM write budget — not finalized.
   */
  maxBatchSize: number;

  /**
   * If total contradiction pressure across active contradictions exceeds this,
   * promotion is suspended globally for this batch.
   * Default 0.75.
   * TODO(doctrine): formula for integrating suppression pressure into LTG conditions.
   */
  suspendUnderPressure: number;
}

const DEFAULT_PROMOTION_CONFIG: PromotionConfig = {
  minAgeMs:             30_000,
  maxBatchSize:         5,
  suspendUnderPressure: 0.75,
};

// ── Condition trace ────────────────────────────────────────────────────────────

/** Trace of each promotion condition evaluated — never hidden from callers. */
export interface PromotionConditionTrace {
  name:   string;
  passed: boolean;
  detail: string;
}

// ── Output shape ───────────────────────────────────────────────────────────────

export type PromotionDecision = 'PROMOTE' | 'DEFER';

export interface PromotionResult {
  decision:    PromotionDecision;

  /** LTG's raw decision before policy adjustments. */
  ltg_decision: LtgDecision;

  /** All conditions evaluated, in order. */
  conditions: PromotionConditionTrace[];

  /** Human-readable reason for the decision. */
  reason: string;
}

export interface BatchPromotionResult {
  promoted:  Array<{ episode: Episode; result: PromotionResult }>;
  deferred:  Array<{ episode: Episode; result: PromotionResult }>;
  suspended: boolean;
  reason:    string;
}

// ── Module-level LTG instance ─────────────────────────────────────────────────

const ltg = new LearningTransferGate();

// ── Single-episode evaluation ──────────────────────────────────────────────────

/**
 * Evaluate a single episode for promotion.
 *
 * @param episode             The episode to evaluate.
 * @param contradictions      Active contradictions from contradiction-store.
 * @param config              Optional policy config.
 * @returns                   PromotionResult with full condition trace.
 */
export function evaluatePromotion(
  episode:       Episode,
  contradictions: Contradiction[],
  config:        Partial<PromotionConfig> = {},
): PromotionResult {
  const cfg        = { ...DEFAULT_PROMOTION_CONFIG, ...config };
  const conditions: PromotionConditionTrace[] = [];

  // ── Condition A: Minimum age ──────────────────────────────────────────────
  const now       = Date.now();
  const ageMs     = now - episode.created_at;
  const ageOk     = ageMs >= cfg.minAgeMs;
  conditions.push({
    name:   'min_age',
    passed: ageOk,
    detail: `age=${ageMs}ms, required=${cfg.minAgeMs}ms`,
  });

  if (!ageOk) {
    return {
      decision:     'DEFER',
      ltg_decision: 'DEFER',
      conditions,
      reason:       `Episode too recent for promotion (age=${ageMs}ms < ${cfg.minAgeMs}ms)`,
    };
  }

  // ── Condition B: No overwhelming contradiction pressure ───────────────────
  // TODO(doctrine): formula for how contradiction pressure modifies each LTG condition
  const totalPressure = contradictions
    .filter((c) => !c.resolved && c.signal_kind === episode.kind)
    .reduce((sum, c) => sum + c.strength, 0);
  const pressureOk = totalPressure < cfg.suspendUnderPressure;
  conditions.push({
    name:   'contradiction_pressure',
    passed: pressureOk,
    detail: `total_pressure=${totalPressure.toFixed(3)}, suspend_threshold=${cfg.suspendUnderPressure}`,
  });

  if (!pressureOk) {
    return {
      decision:     'DEFER',
      ltg_decision: 'DEFER',
      conditions,
      reason:       `Contradiction pressure too high for this episode kind (pressure=${totalPressure.toFixed(3)})`,
    };
  }

  // ── Conditions C–F: LTG four-condition gate ───────────────────────────────
  const ltgDecision = ltg.evaluate(episode);
  conditions.push({
    name:   'ltg_four_conditions',
    passed: ltgDecision === 'PROMOTE',
    detail: `confidence=${episode.confidence.toFixed(2)}, mvi=${episode.mvi.toFixed(3)}, trust=${episode.trust_score.toFixed(2)}`,
  });

  const allPassed = conditions.every((c) => c.passed);
  const decision: PromotionDecision = allPassed && ltgDecision === 'PROMOTE' ? 'PROMOTE' : 'DEFER';
  const reason = decision === 'PROMOTE'
    ? `All ${conditions.length} conditions passed — episode promoted`
    : `Deferred: ${conditions.filter((c) => !c.passed).map((c) => c.name).join(', ')}`;

  return { decision, ltg_decision: ltgDecision, conditions, reason };
}

// ── Batch promotion ────────────────────────────────────────────────────────────

/**
 * Evaluate a batch of episodes for promotion.
 * Respects maxBatchSize and suspends the entire batch if global pressure is too high.
 *
 * @param episodes        Episodes to evaluate (order is preserved).
 * @param contradictions  Active contradictions from contradiction-store.
 * @param config          Optional policy config.
 */
export function evaluateBatch(
  episodes:      Episode[],
  contradictions: Contradiction[],
  config:        Partial<PromotionConfig> = {},
): BatchPromotionResult {
  const cfg = { ...DEFAULT_PROMOTION_CONFIG, ...config };

  // Global suspension check — if total pressure is too high, defer everything
  // TODO(doctrine): global vs per-episode pressure is a policy decision not yet finalized
  const globalPressure = contradictions
    .filter((c) => !c.resolved)
    .reduce((sum, c) => sum + c.strength, 0);

  if (globalPressure >= cfg.suspendUnderPressure * 2) {
    return {
      promoted:  [],
      deferred:  episodes.map((episode) => ({
        episode,
        result: {
          decision:     'DEFER' as PromotionDecision,
          ltg_decision: 'DEFER' as LtgDecision,
          conditions:   [],
          reason:       `Batch suspended: global contradiction pressure=${globalPressure.toFixed(3)}`,
        },
      })),
      suspended: true,
      reason:    `Global contradiction pressure (${globalPressure.toFixed(3)}) suspended batch promotion`,
    };
  }

  const promoted:  BatchPromotionResult['promoted']  = [];
  const deferred:  BatchPromotionResult['deferred']  = [];

  for (const episode of episodes) {
    if (promoted.length >= cfg.maxBatchSize) {
      deferred.push({
        episode,
        result: {
          decision:     'DEFER',
          ltg_decision: 'DEFER',
          conditions:   [],
          reason:       `Batch limit reached (maxBatchSize=${cfg.maxBatchSize})`,
        },
      });
      continue;
    }

    const result = evaluatePromotion(episode, contradictions, config);
    if (result.decision === 'PROMOTE') {
      promoted.push({ episode, result });
    } else {
      deferred.push({ episode, result });
    }
  }

  return {
    promoted,
    deferred,
    suspended: false,
    reason:    `Batch complete: ${promoted.length} promoted, ${deferred.length} deferred`,
  };
}
