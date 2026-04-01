/**
 * Compression Engine — alive-mind
 * src/learning/compression/compression-engine.ts
 *
 * Compresses STM working items when the buffer approaches capacity.
 * Deduplicates by cue similarity, merges related items, and drops
 * low-priority entries that haven't been reinforced.
 *
 * Migration from stub:
 *   The original implementation was `return null` (completely unimplemented).
 *   This version implements real deduplication-based compression — no LLM, no
 *   heuristics beyond structural similarity. The result is deterministic.
 *
 * Strategies:
 *   'dedup'     — exact cue deduplication, keep highest priority per group
 *   'prune_low' — drop items below priority floor
 *   'merge_cue' — group by cue prefix, keep one representative per group
 *
 * Doctrine-sensitive items intentionally not finalized:
 *   - which strategy to apply when
 *   - semantic similarity thresholds (we use prefix matching only)
 *   - how many items to target after compression
 *
 * Design rules:
 *   - No side effects. Returns new array, does not mutate input.
 *   - Deterministic for the same input.
 *   - All dropped items are recorded in the result (never silently lost).
 */

import type { WorkingItem } from '../../memory/memory-types';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface CompressionConfig {
  /**
   * Which compression strategy to use.
   * Default: 'prune_low' (safest — does not merge, only drops below floor).
   */
  strategy: 'dedup' | 'prune_low' | 'merge_cue';

  /**
   * Priority floor for prune_low strategy.
   * Items with priority < floor are dropped.
   * Default 0.15.
   * TODO(doctrine): floor value not finalized.
   */
  priorityFloor: number;

  /**
   * Target output size. Compression continues until output <= target.
   * Default 32.
   */
  maxOutput: number;

  /**
   * Cue prefix length for merge_cue grouping.
   * Items sharing the first N chars of their cue string are merged.
   * Default 20.
   */
  cuePrefixLength: number;
}

const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  strategy:        'prune_low',
  priorityFloor:   0.15,
  maxOutput:       32,
  cuePrefixLength: 20,
};

// ── Output shape ───────────────────────────────────────────────────────────────

export interface CompressedItem extends WorkingItem {
  /**
   * IDs of items that were merged into this one (empty for non-merged items).
   * Preserved for audit and recall traceability.
   */
  merged_from?: string[];
}

export interface CompressionResult {
  /** Compressed item list. Length <= maxOutput. */
  compressed: CompressedItem[];

  /** IDs of items that were dropped. */
  dropped: string[];

  /**
   * Ratio of output to input size (0.0 = everything dropped, 1.0 = no compression).
   * Useful for measuring compression effectiveness.
   */
  reduction_ratio: number;

  /** Which strategy was used. */
  strategy: CompressionConfig['strategy'];

  /** Epoch ms when compression completed. */
  compressed_at: number;
}

// ── Strategy: prune_low ───────────────────────────────────────────────────────

function pruneLow(
  items: WorkingItem[],
  floor: number,
  maxOutput: number,
): { kept: CompressedItem[]; dropped: string[] } {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const viability = sorted.filter((i) => i.priority >= floor);
  const kept    = viability.slice(0, maxOutput);
  const keptIds = new Set(kept.map((i) => i.id));
  const dropped = items.filter((i) => !keptIds.has(i.id)).map((i) => i.id);
  return { kept: kept.map((i) => ({ ...i })), dropped };
}

// ── Strategy: dedup ───────────────────────────────────────────────────────────

function dedup(
  items: WorkingItem[],
  maxOutput: number,
): { kept: CompressedItem[]; dropped: string[] } {
  const byKind = new Map<string, WorkingItem>();

  for (const item of items) {
    const existing = byKind.get(item.kind);
    if (!existing || item.priority > existing.priority) {
      byKind.set(item.kind, item);
    }
  }

  const deduped = [...byKind.values()].sort((a, b) => b.priority - a.priority);
  const kept    = deduped.slice(0, maxOutput).map((i) => ({ ...i }));
  const keptIds = new Set(kept.map((i) => i.id));
  const dropped = items.filter((i) => !keptIds.has(i.id)).map((i) => i.id);
  return { kept, dropped };
}

// ── Strategy: merge_cue ───────────────────────────────────────────────────────

function getCueText(item: WorkingItem): string {
  if (typeof item.value === 'string') return item.value;
  return item.kind;
}

function mergeCue(
  items: WorkingItem[],
  prefixLen: number,
  maxOutput: number,
): { kept: CompressedItem[]; dropped: string[] } {
  const groups = new Map<string, WorkingItem[]>();

  for (const item of items) {
    const cueText = getCueText(item);
    const prefix  = cueText.slice(0, prefixLen).toLowerCase();
    const bucket  = groups.get(prefix) ?? [];
    bucket.push(item);
    groups.set(prefix, bucket);
  }

  const kept: CompressedItem[]  = [];
  const dropped: string[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push({ ...group[0]! });
      continue;
    }
    // Keep highest priority; record merged_from
    const sorted     = group.sort((a, b) => b.priority - a.priority);
    const representative = sorted[0]!;
    const rest           = sorted.slice(1);
    kept.push({
      ...representative,
      merged_from: rest.map((i) => i.id),
    });
    dropped.push(...rest.map((i) => i.id));
  }

  // Apply max output constraint
  const sortedKept = kept.sort((a, b) => b.priority - a.priority);
  const final      = sortedKept.slice(0, maxOutput);
  const overflow   = sortedKept.slice(maxOutput).map((i) => i.id);

  return {
    kept:    final,
    dropped: [...dropped, ...overflow],
  };
}

// ── Main entry point ───────────────────────────────────────────────────────────

/**
 * Compress a set of working items to fit within a target size.
 *
 * @param items     Input working items (not mutated).
 * @param _cue      Context cue (reserved for future semantic similarity — unused now).
 * @param maxOutput Override for target output size. Defaults to config.maxOutput.
 * @param config    Optional compression config.
 * @returns         CompressedResult with compressed items and drop list.
 */
export function compress(
  items:     WorkingItem[],
  _cue      = '',
  maxOutput?: number,
  config:    Partial<CompressionConfig> = {},
): CompressionResult {
  const cfg    = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  const target = maxOutput ?? cfg.maxOutput;

  if (items.length === 0) {
    return {
      compressed:      [],
      dropped:         [],
      reduction_ratio: 1.0,
      strategy:        cfg.strategy,
      compressed_at:   Date.now(),
    };
  }

  let kept:    CompressedItem[];
  let dropped: string[];

  switch (cfg.strategy) {
    case 'dedup':
      ({ kept, dropped } = dedup(items, target));
      break;
    case 'merge_cue':
      ({ kept, dropped } = mergeCue(items, cfg.cuePrefixLength, target));
      break;
    case 'prune_low':
    default:
      ({ kept, dropped } = pruneLow(items, cfg.priorityFloor, target));
      break;
  }

  return {
    compressed:      kept,
    dropped,
    reduction_ratio: items.length > 0 ? kept.length / items.length : 1.0,
    strategy:        cfg.strategy,
    compressed_at:   Date.now(),
  };
}
