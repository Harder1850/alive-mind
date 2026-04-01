/**
 * Signal Interpreter — alive-mind
 * src/interpretation/signal-interpreter.ts
 *
 * Pre-cognition classification layer. Takes a raw Signal and produces a rich
 * InterpretedSignal that carries context for the recall and candidate stages.
 *
 * This is NOT a decision layer. It does not choose actions.
 * It classifies what the signal is about so that downstream stages can be
 * appropriately bounded and directed.
 *
 * Design rules:
 *   - Deterministic. Same signal → same interpretation.
 *   - No side effects. No external calls.
 *   - Returns confidence < 1.0 to signal uncertainty — never fabricates certainty.
 *   - All doctrine-sensitive thresholds (e.g., urgency class boundaries) are
 *     injectable via InterpretationConfig so policies can evolve without touching logic.
 *
 * Migration note:
 *   Extracted from the implicit classification logic scattered across
 *   phase1-cognition-loop.ts (chooseActionType, noveltyOf, relevanceOf) and
 *   phase1-runtime.ts (shouldOpenDeepCognition). Those callers continue to work
 *   unchanged — this module provides an explicit surface for the same reasoning.
 */

import type { Signal, SignalKind } from '../../../../alive-constitution/contracts/signal';

// ── Classification enums ───────────────────────────────────────────────────────

/** Categorical urgency derived from urgency 0.0–1.0 and signal kind. */
export type UrgencyClass = 'low' | 'medium' | 'high' | 'critical';

/** How novel/unexpected this signal is relative to baseline. */
export type NoveltyClass = 'routine' | 'notable' | 'novel' | 'unknown';

/** What cognition depth is appropriate to spend on this signal. */
export type CognitionDepth = 'baseline' | 'deep';

/** Broad topic domain inferred from signal kind and source. */
export type SignalTopic =
  | 'system_resources'  // cpu, disk, memory
  | 'file_system'       // file changes, directory events
  | 'repository'        // git commits, PRs
  | 'process_lifecycle' // process start/stop/error
  | 'user_intent'       // explicit user input
  | 'sensor_health'     // system health, process health
  | 'unknown';          // could not be classified

// ── Output shape ───────────────────────────────────────────────────────────────

export interface InterpretedSignal {
  /** Original signal — never mutated. */
  signal_id: string;

  /** What broad domain this signal concerns. */
  topic: SignalTopic;

  /** Categorical urgency class. */
  urgency_class: UrgencyClass;

  /** How novel this signal is. Feeds deep-cognition decision. */
  novelty_class: NoveltyClass;

  /** What cognition depth is appropriate. */
  recommended_depth: CognitionDepth;

  /**
   * Context tags to inject into memory recall.
   * These are structural tags derived from the signal — no semantic inference.
   * E.g., ['file_change', 'filesystem', 'source_file'] for a file change event.
   */
  context_tags: string[];

  /**
   * How confident this interpretation is (0.0–1.0).
   * Low confidence = signal kind is 'unknown' or raw_content is empty.
   * Does not reflect runtime decision confidence — that lives in ActionCandidate.
   */
  interpretation_confidence: number;

  /**
   * Human-readable one-line classification summary.
   * Grounded in signal.kind, signal.source, urgency_class, novelty_class.
   * Used by Story Mode's 'noticed' sentence as an alternative to raw content.
   */
  classification_summary: string;

  /** Epoch ms when this interpretation was computed. */
  interpreted_at: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────

/**
 * Doctrine-sensitive thresholds exposed as injectable config.
 * Defaults are conservative starting points — not finalized policy.
 */
export interface InterpretationConfig {
  /** urgency >= this → 'high' class (below = 'medium'). Default 0.65. */
  highUrgencyThreshold:     number;
  /** urgency >= this → 'critical' class. Default 0.85. */
  criticalUrgencyThreshold: number;
  /** novelty >= this → 'novel' (below = 'notable'). Default 0.65. */
  novelNoveltyThreshold:    number;
  /** novelty >= this → deep cognition recommended. Default 0.60. */
  deepCognitionThreshold:   number;
}

const DEFAULT_CONFIG: InterpretationConfig = {
  highUrgencyThreshold:     0.65,
  criticalUrgencyThreshold: 0.85,
  novelNoveltyThreshold:    0.65,
  deepCognitionThreshold:   0.60,
};

// ── Internal classifiers ───────────────────────────────────────────────────────

function classifyTopic(signal: Signal): SignalTopic {
  switch (signal.kind) {
    case 'cpu_utilization':
    case 'disk_available':
      return 'system_resources';
    case 'file_change_event':
      return 'file_system';
    case 'repo_commit':
    case 'repo_pr':
      return 'repository';
    case 'process_error':
      return 'process_lifecycle';
    case 'process_health':
    case 'system_startup':
      return 'sensor_health';
    case 'user_input':
      return 'user_intent';
    case 'unknown':
    default:
      return 'unknown';
  }
}

function classifyUrgency(signal: Signal, cfg: InterpretationConfig): UrgencyClass {
  const u = signal.urgency ?? 0;
  if (signal.threat_flag || u >= cfg.criticalUrgencyThreshold) return 'critical';
  if (u >= cfg.highUrgencyThreshold) return 'high';
  if (u >= 0.35) return 'medium';
  return 'low';
}

/**
 * Novelty classification.
 * Uses signal.novelty if it has been set (runtime CB updates it after baseline comparison).
 * Falls back to structural heuristics from raw_content if novelty is 0.0 (not yet set).
 */
function classifyNovelty(signal: Signal, cfg: InterpretationConfig): NoveltyClass {
  const n = signal.novelty ?? 0;
  const raw = String(signal.raw_content ?? '').toLowerCase();

  // signal.kind = 'unknown' → always novel (we don't know what this is)
  if (signal.kind === 'unknown') return 'unknown';

  // If the runtime CB has populated novelty, use it directly
  if (n > 0) {
    if (n >= cfg.novelNoveltyThreshold) return 'novel';
    if (n >= 0.35) return 'notable';
    return 'routine';
  }

  // Structural heuristics from raw content when novelty hasn't been set
  const novelKeywords = ['new', 'unexpected', 'changed', 'appeared', 'created', 'missing'];
  if (novelKeywords.some((kw) => raw.includes(kw))) return 'notable';
  return 'routine';
}

function recommendDepth(
  signal: Signal,
  noveltyClass: NoveltyClass,
  urgencyClass: UrgencyClass,
  cfg: InterpretationConfig,
): CognitionDepth {
  if (urgencyClass === 'critical' || urgencyClass === 'high') return 'deep';
  if (noveltyClass === 'novel' || noveltyClass === 'unknown') return 'deep';
  if (signal.novelty >= cfg.deepCognitionThreshold) return 'deep';
  if (signal.kind === 'user_input') return 'deep';  // always engage on explicit requests
  return 'baseline';
}

function buildContextTags(signal: Signal, topic: SignalTopic): string[] {
  const tags: string[] = [signal.kind, signal.source, topic];

  // Structural tags from payload
  if (signal.payload) {
    const path = signal.payload['file_path'] as string | undefined;
    if (path) {
      tags.push('has_file_path');
      if (path.endsWith('.ts') || path.endsWith('.js')) tags.push('source_file');
      if (path.includes('test') || path.includes('spec')) tags.push('test_file');
      if (path.includes('node_modules')) tags.push('dependency_file');
      if (path.includes('.git')) tags.push('git_internals');
    }
    const cpuRisk = signal.payload['cpu_risk'] as number | undefined;
    if (typeof cpuRisk === 'number' && cpuRisk > 0.7) tags.push('high_cpu_risk');
  }

  // Error signal tags
  const raw = String(signal.raw_content ?? '').toLowerCase();
  if (raw.includes('error') || raw.includes('fail') || raw.includes('exception')) {
    tags.push('error_content');
  }
  if (raw.includes('timeout') || raw.includes('crash')) tags.push('critical_failure');

  return [...new Set(tags)];  // deduplicate
}

function buildClassificationSummary(
  signal: Signal,
  topic: SignalTopic,
  urgencyClass: UrgencyClass,
  noveltyClass: NoveltyClass,
): string {
  const src   = `${signal.source}/${signal.kind}`;
  const topicLabel = topic.replace(/_/g, ' ');
  const urgLabel   = urgencyClass !== 'low' ? ` [${urgencyClass.toUpperCase()} urgency]` : '';
  const novLabel   = noveltyClass !== 'routine' ? ` [${noveltyClass}]` : '';
  return `${topicLabel} signal from ${src}${urgLabel}${novLabel}`;
}

// ── Main interpreter ───────────────────────────────────────────────────────────

export function interpretSignal(
  signal: Signal,
  config: Partial<InterpretationConfig> = {},
): InterpretedSignal {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const topic         = classifyTopic(signal);
  const urgencyClass  = classifyUrgency(signal, cfg);
  const noveltyClass  = classifyNovelty(signal, cfg);
  const depth         = recommendDepth(signal, noveltyClass, urgencyClass, cfg);
  const contextTags   = buildContextTags(signal, topic);
  const summary       = buildClassificationSummary(signal, topic, urgencyClass, noveltyClass);

  // Confidence is reduced for 'unknown' signals and empty/null raw content
  const hasContent    = String(signal.raw_content ?? '').trim().length > 0;
  const isKnown       = signal.kind !== 'unknown';
  const confidence    = Math.round((hasContent ? 0.8 : 0.4) * (isKnown ? 1.0 : 0.6) * 1000) / 1000;

  return {
    signal_id:              signal.id,
    topic,
    urgency_class:          urgencyClass,
    novelty_class:          noveltyClass,
    recommended_depth:      depth,
    context_tags:           contextTags,
    interpretation_confidence: confidence,
    classification_summary: summary,
    interpreted_at:         Date.now(),
  };
}
