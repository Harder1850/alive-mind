/**
 * Consolidation Engine — alive-mind (SKELETON)
 * src/consolidation/consolidation-engine.ts
 *
 * Manages the lifecycle transition of memory from STM working space to structured
 * LTM representations. Batches promotion decisions, applies compression to the
 * remaining working set, and prunes entries below viability thresholds.
 *
 * Current status:
 *   - All interfaces are finalized and typed.
 *   - consolidate() orchestrates the pipeline structure correctly.
 *   - Compression is delegated to src/learning/compression/compression-engine.ts.
 *   - Promotion is delegated to src/promotion/promotion-policy.ts.
 *   - Pruning applies a configurable confidence floor — safe to use.
 *
 * Doctrine-sensitive items left as explicit placeholders:
 *   - viability threshold formula (currently a static confidence floor)
 *   - consolidation cycle frequency and trigger conditions
 *   - interaction between consolidation and active thread tracking
 *   - LTM write format (episodes are promoted as-is for now)
 *
 * Design rules:
 *   - No FS side effects. No network. No execution.
 *   - All state is passed in and returned — no module-level mutable state.
 *   - Pruned items are listed in the result, never silently dropped.
 */

import type { Episode } from '../../../../alive-constitution/contracts/memory';
import type { WorkingItem } from '../memory/memory-types';
import { evaluateBatch, type BatchPromotionResult } from '../promotion/promotion-policy';
import { compress } from '../learning/compression/compression-engine';
import { getActive as getActiveContradictions, type Contradiction } from '../memory/contradiction-store';

// ── Config ─────────────────────────────────────────────────────────────────────

/**
 * Doctrine-sensitive consolidation parameters.
 * All defaults are conservative starting points — NOT finalized policy.
 *
 * TODO(doctrine): viability formula — currently a static confidence floor.
 * TODO(doctrine): consolidation frequency — currently caller-driven, not auto-scheduled.
 * TODO(doctrine): interaction with thread activity — active thread episodes may need different treatment.
 */
export interface ConsolidationConfig {
  /**
   * Episodes with confidence below this are pruned from STM without promotion.
   * Default 0.20.
   * TODO(doctrine): not finalized.
   */
  viabilityFloor: number;

  /**
   * Maximum STM working items after compression.
   * If STM exceeds this, compression runs to reduce to this target.
   * Default 64.
   * TODO(doctrine): depends on memory budget formula.
   */
  stmTargetSize: number;

  /**
   * Whether to run compression after promotion.
   * Default true.
   */
  compressAfterPromotion: boolean;
}

const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  viabilityFloor:         0.20,
  stmTargetSize:          64,
  compressAfterPromotion: true,
};

// ── Input / output shapes ──────────────────────────────────────────────────────

export interface ConsolidationInput {
  /** Episodes currently in STM awaiting promotion evaluation. */
  episodesForBatch: Episode[];

  /** Current STM working items for compression. */
  workingItems: WorkingItem[];

  /** Active contradiction records (from contradiction-store) for pressure context. */
  contradictions?: Contradiction[];
}

export interface ConsolidationResult {
  /** Episode IDs that passed promotion and should be written to LTM. */
  promoted: string[];

  /** Episode IDs that were deferred back to STM for future evaluation. */
  deferred: string[];

  /** Episode IDs pruned from STM due to being below viability floor. */
  pruned: string[];

  /** Compressed working items. Caller should replace workingItems with this. */
  compressed_working: WorkingItem[];

  /** Whether the batch was globally suspended due to contradiction pressure. */
  batch_suspended: boolean;

  /**
   * Trace of what happened in each stage.
   * Each entry is a grounded step description, not fabricated reasoning.
   */
  trace: string[];

  /** Epoch ms when consolidation completed. */
  consolidated_at: number;
}

// ── Pruning ───────────────────────────────────────────────────────────────────

function pruneBelow(
  episodes: Episode[],
  floor: number,
): { viable: Episode[]; pruned: string[] } {
  const viable:  Episode[] = [];
  const pruned:  string[]  = [];
  for (const ep of episodes) {
    if (ep.confidence >= floor) {
      viable.push(ep);
    } else {
      pruned.push(ep.id);
    }
  }
  return { viable, pruned };
}

// ── Main consolidation function ────────────────────────────────────────────────

/**
 * Run one consolidation cycle over the provided STM contents.
 *
 * Pipeline:
 *   1. Prune episodes below viability floor
 *   2. Run batch promotion on viable episodes
 *   3. Compress working items if target size exceeded
 *
 * @param input   Current STM state to consolidate.
 * @param config  Optional consolidation config.
 * @returns       ConsolidationResult with all decisions — never throws.
 */
export function consolidate(
  input:  ConsolidationInput,
  config: Partial<ConsolidationConfig> = {},
): ConsolidationResult {
  const cfg          = { ...DEFAULT_CONSOLIDATION_CONFIG, ...config };
  const trace:        string[] = [];
  const contradictions = input.contradictions ?? getActiveContradictions();

  // ── Stage 1: Prune below viability floor ──────────────────────────────────
  const { viable, pruned } = pruneBelow(input.episodesForBatch, cfg.viabilityFloor);
  trace.push(`Stage 1 pruning: ${pruned.length} pruned (confidence < ${cfg.viabilityFloor}), ${viable.length} viable`);

  // ── Stage 2: Batch promotion ───────────────────────────────────────────────
  let batchResult: BatchPromotionResult = { promoted: [], deferred: [], suspended: false, reason: '' };

  if (viable.length > 0) {
    batchResult = evaluateBatch(viable, contradictions, {
      maxBatchSize: Math.ceil(viable.length / 2),  // promote at most half per cycle
    });
    trace.push(`Stage 2 promotion: ${batchResult.promoted.length} promoted, ${batchResult.deferred.length} deferred${batchResult.suspended ? ' [SUSPENDED]' : ''}`);
  } else {
    trace.push('Stage 2 promotion: skipped — no viable episodes');
  }

  // ── Stage 3: Compression ───────────────────────────────────────────────────
  let compressedWorking = input.workingItems;
  if (cfg.compressAfterPromotion && input.workingItems.length > cfg.stmTargetSize) {
    const compressionResult = compress(input.workingItems, '', cfg.stmTargetSize);
    compressedWorking = compressionResult.compressed;
    trace.push(
      `Stage 3 compression: ${input.workingItems.length} → ${compressedWorking.length} ` +
      `(ratio=${compressionResult.reduction_ratio.toFixed(2)}, strategy=${compressionResult.strategy})`
    );
  } else {
    trace.push(`Stage 3 compression: skipped (${input.workingItems.length} items ≤ target ${cfg.stmTargetSize})`);
  }

  return {
    promoted:           batchResult.promoted.map((p) => p.episode.id),
    deferred:           batchResult.deferred.map((p) => p.episode.id),
    pruned,
    compressed_working: compressedWorking,
    batch_suspended:    batchResult.suspended,
    trace,
    consolidated_at:    Date.now(),
  };
}
