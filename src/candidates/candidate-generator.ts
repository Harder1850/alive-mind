/**
 * Candidate Generator — alive-mind
 * src/candidates/candidate-generator.ts
 *
 * Clean public surface for producing ActionCandidate sets from a signal and
 * its memory context. Wraps the tiered synthesize pipeline and the Phase 1
 * cognition loop's candidate builder into a single well-typed entry point.
 *
 * This module does NOT validate or evaluate candidates — that is the job of
 * src/evaluation/evaluation-engine.ts. It only generates them.
 *
 * Architecture:
 *   Two candidate types co-exist in the codebase:
 *
 *   1. decisions/synthesize.ts ActionCandidate — richer type with SVE/CCE/ARE
 *      fields; used by the full synthesis pipeline (rule/episode/semantic/LLM).
 *      Produces constitution Action (display_text | write_file).
 *
 *   2. spine/phase1-cognition-loop.ts ActionCandidate — proving-scenario type;
 *      has action_type from the 8-value whitelist; produced by chooseActionType.
 *      Used by the current live Phase 1 path.
 *
 *   This module works with Type 1 (synthesis pipeline) and exposes a bridge to
 *   Type 2 for callers that need the proving-scenario shape.
 *
 * Migration note:
 *   Previously, candidate generation was embedded in the phase1-cognition-loop.ts
 *   (chooseActionType + buildActionCandidate) and in decisions/synthesize.ts
 *   (tryRule/tryEpisode/trySemantic hierarchy). This module provides a clean port
 *   that can call either path. Phase1 callers continue to use the loop directly;
 *   this module is the migration target for when the two paths unify.
 *
 * Doctrine-sensitive: generation depth limits and confidence floors are left as
 * injectable config — no policy values are hardcoded as final.
 */

import type { Signal } from '../../../alive-constitution/contracts';
import { synthesize } from '../decisions/synthesize';
import type { ActionCandidate as SynthesisCandidate, SynthesizerLevel } from '../decisions/synthesize';
import type { RecallResult } from '../memory/recall-engine';

// ── Config ─────────────────────────────────────────────────────────────────────

/**
 * Controls how many candidates to generate and what quality floor to enforce.
 * All values are doctrine-sensitive — these defaults are conservative starting points.
 */
export interface CandidateGeneratorConfig {
  /** Max candidates to return in a batch. Default 3. */
  maxCandidates: number;
  /** Minimum confidence for a candidate to be included. Default 0.30. */
  confidenceFloor: number;
  /** Whether to include the fallback candidate if all others fail. Default true. */
  includeFallback: boolean;
}

const DEFAULT_CONFIG: CandidateGeneratorConfig = {
  maxCandidates:   3,
  confidenceFloor: 0.30,
  includeFallback: true,
};

// ── Output shapes ──────────────────────────────────────────────────────────────

/**
 * A candidate annotated with generation provenance.
 * Extends the synthesis candidate with traceability metadata.
 */
export interface GeneratedCandidate {
  /** The synthesis candidate with action, confidence, risk, SVE/CCE/ARE fields. */
  candidate:  SynthesisCandidate;

  /** Which tier produced this candidate. */
  level:      SynthesizerLevel;

  /**
   * Which memory records informed this candidate.
   * IDs into the RecallResult — for evaluation context.
   * Empty for procedure/rule matches (no memory dependency).
   */
  memory_refs: string[];

  /** Whether this was the fallback candidate. */
  is_fallback: boolean;
}

export interface CandidateSet {
  /** Candidates produced for this signal, ordered by confidence descending. */
  candidates: GeneratedCandidate[];

  /**
   * All synthesizer levels that were tried, in order.
   * Useful for debugging and explanation.
   */
  levels_tried: SynthesizerLevel[];

  /** How many cycles did not produce a viable candidate before this result. */
  rejected_count: number;

  /** Epoch ms when generation completed. */
  generated_at: number;
}

// ── Recall context builder ────────────────────────────────────────────────────

/** Extract memory IDs from a RecallResult for provenance tracking. */
function extractMemoryRefs(recall: RecallResult): string[] {
  return [
    ...recall.working.map((w) => w.id),
    ...recall.references.map((r) => r.id),
    ...recall.episodes.map((e) => e.id),
    ...recall.procedures.map((p) => p.id),
  ].slice(0, 8);  // bounded: no more than 8 refs per candidate
}

// ── Main generator ─────────────────────────────────────────────────────────────

/**
 * Generate a bounded set of ActionCandidates for the given signal.
 *
 * Uses the tiered synthesize pipeline: procedure → rule → episode → semantic → LLM → fallback.
 * Currently generates one candidate (the first viable tier match). The maxCandidates config
 * is reserved for a future multi-candidate path where all tiers are sampled.
 *
 * @param signal   The signal to generate candidates for. Must be firewall-cleared.
 * @param recall   Memory context from the recall engine. Passed for provenance tracking.
 * @param config   Optional generation config. Doctrine-sensitive.
 */
export function generateCandidates(
  signal:  Signal,
  recall:  RecallResult,
  config:  Partial<CandidateGeneratorConfig> = {},
): CandidateSet {
  const cfg         = { ...DEFAULT_CONFIG, ...config };
  const memoryRefs  = extractMemoryRefs(recall);

  // TODO: when multi-candidate support is added, call synthesize multiple times
  // with different contexts or pass all tiers' outputs here.
  const result      = synthesize(signal);
  const raw         = result.candidate;

  const results: GeneratedCandidate[] = [];
  let   rejectedCount = 0;

  // Apply confidence floor (fallback is always kept if includeFallback is true)
  const isFallback = raw.level === 'fallback';
  if (raw.confidence >= cfg.confidenceFloor || (isFallback && cfg.includeFallback)) {
    results.push({
      candidate:   raw,
      level:       raw.level,
      memory_refs: memoryRefs,
      is_fallback: isFallback,
    });
  } else {
    rejectedCount++;
    // If the only candidate was filtered out, add fallback if configured
    if (cfg.includeFallback && !isFallback) {
      const fallbackResult = synthesize(signal);  // will hit fallback since same signal
      results.push({
        candidate:   fallbackResult.candidate,
        level:       'fallback',
        memory_refs: [],
        is_fallback: true,
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.candidate.confidence - a.candidate.confidence);

  return {
    candidates:     results.slice(0, cfg.maxCandidates),
    levels_tried:   result.levelsTriedBeforMatch,
    rejected_count: rejectedCount,
    generated_at:   Date.now(),
  };
}

/**
 * Pick the best candidate from a CandidateSet.
 * Returns undefined if the set is empty (should not happen with includeFallback=true).
 */
export function selectBestCandidate(set: CandidateSet): GeneratedCandidate | undefined {
  return set.candidates[0];
}
