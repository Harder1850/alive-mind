/**
 * Evaluation Engine — alive-mind
 * src/evaluation/evaluation-engine.ts
 *
 * Single evaluation pipeline that runs SVE → CCE → ARE over a candidate
 * and returns a single authoritative EvaluationResult.
 *
 * Previously, SVE, CCE, and ARE were called individually and their results
 * scattered across synthesize.ts. This module provides a clean, unified port.
 *
 * Design rules:
 *   - Pure function. No side effects. No module-level state.
 *   - All doctrine-sensitive thresholds are injectable via EvaluationConfig.
 *   - Returns structured results even for blocked candidates (do not throw).
 *   - Contradiction suppression pressure is visible in the result — never hidden.
 *
 * Safe scoring structure:
 *   score = base_confidence × trust_weight × evidence_bonus − suppression_penalty
 *   ARE triggers only when risk >= threshold (configurable, default 0.40).
 *   Final score clamped to [0.0, 1.0].
 *
 * Doctrine-sensitive items intentionally left as config placeholders:
 *   - dominance math (how to weigh SVE warnings vs CCE penalties)
 *   - interruption arbitration thresholds
 *   - final score aggregation across multiple candidates
 *
 * Migration note:
 *   Extracted from decisions/synthesize.ts validateCandidate() and the
 *   individual validate/scoreCandidate/challenge call sites.
 *   All existing callers continue to use those functions directly —
 *   this module is the migration target for a unified evaluation path.
 */

import type { Signal }          from '../../../../alive-constitution/contracts';
import type { ActionCandidate } from '../decisions/synthesize';
import { validate,              type SVEResult  } from '../cognition/sve';
import { scoreCandidate,        type CCEResult  } from '../cognition/cce';
import { challenge,             type AREResult  } from '../cognition/are';

// ── Config ─────────────────────────────────────────────────────────────────────

/**
 * Doctrine-sensitive evaluation thresholds exposed as injectable config.
 * These defaults are starting points only — not finalized policy.
 *
 * TODO(doctrine): dominance math for multi-candidate scoring
 * TODO(doctrine): interruption arbitration thresholds
 * TODO(doctrine): conflict lifecycle scoring
 */
export interface EvaluationConfig {
  /**
   * Minimum score for a candidate to pass evaluation.
   * Default 0.30. Raise to require higher confidence before proceeding.
   */
  passingScore: number;

  /**
   * Prediction accuracy supplied to CCE.
   * Default 0.5 (neutral — no prior calibration data).
   * Range: 0.0–1.0.
   */
  predictionAccuracy: number;

  /**
   * Evidence count supplied to CCE.
   * Default 0 (no prior evidence for this signal type).
   * TODO(doctrine): connected to learning loop when calibration is finalized.
   */
  evidenceCount: number;

  /**
   * Source trust for CCE scoring.
   * Default: candidate.confidence (self-referential).
   * TODO(doctrine): will be seeded from trust engine when resolved.
   */
  sourceTrust?: number;
}

const DEFAULT_EVAL_CONFIG: EvaluationConfig = {
  passingScore:       0.30,
  predictionAccuracy: 0.50,
  evidenceCount:      0,
  sourceTrust:        undefined,  // defaults to candidate.confidence
};

// ── Output shape ───────────────────────────────────────────────────────────────

export interface EvaluationResult {
  /** Whether this candidate should proceed to candidate selection. */
  passed: boolean;

  /**
   * Final composite score after SVE/CCE/ARE adjustments.
   * Clamped to [0.0, 1.0].
   *
   * NOTE: Aggregation formula (how SVE warn degrades score, how ARE adjustments
   * compound with CCE) is a placeholder. Current formula:
   *   final = CCE.adjusted_confidence + ARE.confidence_adjustment
   * TODO(doctrine): dominance math will replace this.
   */
  score: number;

  /** SVE result — internal consistency check. */
  sve: SVEResult;

  /** CCE result — confidence scoring and suppression evaluation. */
  cce: CCEResult;

  /** ARE result — adversarial challenge (risk-conditional). */
  are: AREResult;

  /**
   * Why this candidate was blocked, if passed === false.
   * Always set when passed === false.
   */
  block_reason?: string;

  /**
   * Whether the candidate's risk was adjusted downward by ARE.
   * Caller should use this to update the candidate's risk_score field.
   */
  adjusted_risk: number;

  /** Epoch ms when evaluation completed. */
  evaluated_at: number;
}

// ── Score aggregation ─────────────────────────────────────────────────────────
//
// TODO(doctrine): this formula is a placeholder.
// The current approach simply adds ARE.confidence_adjustment to CCE.adjusted_confidence.
// Final dominance math (weighing SVE warnings, contradiction pressure, calibration offsets)
// is intentionally not finalized here. Expose all components in the result so the
// formula can be evolved without changing the interface.

function aggregateScore(cce: CCEResult, are: AREResult): number {
  return Math.min(1.0, Math.max(0.0, cce.adjusted_confidence + are.confidence_adjustment));
}

function aggregateRisk(baseRisk: number, are: AREResult): number {
  return Math.min(1.0, Math.max(0.0, baseRisk + are.risk_adjustment));
}

// ── Main evaluation function ───────────────────────────────────────────────────

/**
 * Evaluate a candidate through the SVE → CCE → ARE pipeline.
 *
 * @param candidate  The candidate to evaluate.
 * @param signal     The originating signal (context for CCE and ARE).
 * @param config     Optional evaluation config. Doctrine-sensitive thresholds.
 * @returns          EvaluationResult with pass/fail, score, and all sub-results.
 */
export function evaluate(
  candidate: ActionCandidate,
  signal:    Signal,
  config:    Partial<EvaluationConfig> = {},
): EvaluationResult {
  const cfg = { ...DEFAULT_EVAL_CONFIG, ...config };
  const now = Date.now();

  // ── Stage 1: SVE — internal consistency ───────────────────────────────────
  const sve = validate(candidate);

  if (!sve.proceed) {
    const areFailed: AREResult = {
      fired: false, challenges: [], confidence_adjustment: 0,
      risk_adjustment: 0, recommend_safer_alternative: false,
      summary: 'ARE not run — SVE blocked candidate',
    };
    const cceFailed: CCEResult = {
      base_confidence:     candidate.confidence,
      adjusted_confidence: 0,
      suppression:         { total_pressure: 0, votes: [], should_block: false },
      proceed:             false,
      reason:              'CCE not run — SVE blocked candidate',
      factors:             { base: candidate.confidence, prediction_bonus: 0, evidence_bonus: 0, trust_modifier: 0, suppression_penalty: 0 },
    };
    return {
      passed:       false,
      score:        0,
      sve,
      cce:          cceFailed,
      are:          areFailed,
      block_reason: `SVE blocked: ${sve.reason}`,
      adjusted_risk: candidate.risk,
      evaluated_at:  now,
    };
  }

  // ── Stage 2: CCE — confidence scoring and suppression ─────────────────────
  const cce = scoreCandidate({
    candidate,
    signal,
    prediction_accuracy: cfg.predictionAccuracy,
    evidence_count:      cfg.evidenceCount,
    source_trust:        cfg.sourceTrust ?? candidate.confidence,
  });

  if (!cce.proceed) {
    const areSkipped: AREResult = {
      fired: false, challenges: [], confidence_adjustment: 0,
      risk_adjustment: 0, recommend_safer_alternative: false,
      summary: 'ARE not run — CCE blocked candidate',
    };
    return {
      passed:       false,
      score:        cce.adjusted_confidence,
      sve,
      cce,
      are:          areSkipped,
      block_reason: `CCE blocked: ${cce.reason}`,
      adjusted_risk: candidate.risk,
      evaluated_at:  now,
    };
  }

  // ── Stage 3: ARE — adversarial challenge (risk-conditional) ───────────────
  const are = challenge(candidate, signal);

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const score        = aggregateScore(cce, are);
  const adjustedRisk = aggregateRisk(candidate.risk, are);
  const passed       = score >= cfg.passingScore;

  return {
    passed,
    score,
    sve,
    cce,
    are,
    block_reason:  passed ? undefined : `Score ${score.toFixed(3)} below passing threshold ${cfg.passingScore}`,
    adjusted_risk: adjustedRisk,
    evaluated_at:  now,
  };
}

/**
 * Evaluate multiple candidates and return them sorted by score descending.
 * Blocked candidates are included (with passed=false) so callers can inspect
 * why each was blocked — do not silently discard.
 */
export function evaluateAll(
  candidates: ActionCandidate[],
  signal:     Signal,
  config:     Partial<EvaluationConfig> = {},
): Array<{ candidate: ActionCandidate; evaluation: EvaluationResult }> {
  return candidates
    .map((candidate) => ({
      candidate,
      evaluation: evaluate(candidate, signal, config),
    }))
    .sort((a, b) => b.evaluation.score - a.evaluation.score);
}
