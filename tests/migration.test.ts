/**
 * Migration tests — alive-mind
 * tests/migration.test.ts
 *
 * Covers:
 *   1. All new modules compile and export their main functions/classes
 *   2. Signal interpreter — classification correctness
 *   3. Evaluation engine — SVE→CCE→ARE pipeline and blocking
 *   4. Candidate generator — tiered pipeline wrapping
 *   5. Simulation engine — depth 0/1 structure
 *   6. Promotion policy — four-condition gate with context
 *   7. Consolidation engine — pipeline stages
 *   8. Calibration surface — all four subsystems return structured output
 *   9. Compression engine — dedup/prune_low/merge_cue strategies
 *  10. Reinforcement engine — injected store, no FS side effects
 *  11. Contradiction store — unchanged; evaluateSuppression still works
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeSignal } from '../../alive-constitution/contracts';
import type { Signal, Episode } from '../../alive-constitution/contracts';

import { interpretSignal } from '../src/interpretation/signal-interpreter';
import { generateCandidates } from '../src/candidates/candidate-generator';
import { evaluate, evaluateAll } from '../src/evaluation/evaluation-engine';
import { simulate } from '../src/simulation/simulation-engine';
import { evaluatePromotion, evaluateBatch } from '../src/promotion/promotion-policy';
import { consolidate } from '../src/consolidation/consolidation-engine';
import {
  computeCalibrationOffset, detectDrift, attributeError, suggestThresholdAdjustment,
} from '../src/calibration/calibration-surface';
import { compress } from '../src/learning/compression/compression-engine';
import {
  ReinforcementEngine, InMemoryReinforcementStore, reinforcement,
} from '../src/learning/reinforcement-decay/reinforcement-engine';
import {
  recordContradiction, evaluateSuppression, clearAll, getActive,
} from '../src/memory/contradiction-store';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTestSignal(overrides: Partial<Signal> = {}): Signal {
  return makeSignal({
    id:              'test-' + Math.random().toString(36).slice(2, 8),
    source:          'filesystem',
    kind:            'file_change_event',
    raw_content:     'test signal content',
    timestamp:       Date.now(),
    urgency:         0.55,
    confidence:      0.80,
    quality_score:   0.80,
    threat_flag:     false,
    firewall_status: 'cleared',
    novelty:         0.70,
    ...overrides,
  });
}

function makeTestEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id:            'ep-' + Math.random().toString(36).slice(2, 8),
    kind:          'file_change_event',
    source:        'filesystem',
    signal_id:     'sig-test',
    outcome:       'success',
    confidence:    0.75,
    mvi:           0.65,
    created_at:    Date.now() - 60_000,
    last_accessed: Date.now(),
    lifecycle:     'active',
    trust_score:   0.70,
    ...overrides,
  };
}

function makeTestCandidate(overrides = {}) {
  return {
    id:             'cand-' + Math.random().toString(36).slice(2, 8),
    action:         { type: 'display_text' as const, payload: 'Test action — valid candidate', is_reversible: true },
    level:          'rule' as const,
    reason:         'Test rule matched — proceeding with display',
    confidence:     0.75,
    risk:           0.10,
    source_memories: [] as string[],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('alive-mind migration — new subsystems', () => {

  // ── 1. Module compile/import ────────────────────────────────────────────────
  it('1: all new modules export their primary surfaces', () => {
    assert.equal(typeof interpretSignal,            'function', 'interpretSignal');
    assert.equal(typeof generateCandidates,         'function', 'generateCandidates');
    assert.equal(typeof evaluate,                   'function', 'evaluate');
    assert.equal(typeof evaluateAll,                'function', 'evaluateAll');
    assert.equal(typeof simulate,                   'function', 'simulate');
    assert.equal(typeof evaluatePromotion,          'function', 'evaluatePromotion');
    assert.equal(typeof evaluateBatch,              'function', 'evaluateBatch');
    assert.equal(typeof consolidate,                'function', 'consolidate');
    assert.equal(typeof computeCalibrationOffset,   'function', 'computeCalibrationOffset');
    assert.equal(typeof detectDrift,                'function', 'detectDrift');
    assert.equal(typeof attributeError,             'function', 'attributeError');
    assert.equal(typeof suggestThresholdAdjustment, 'function', 'suggestThresholdAdjustment');
    assert.equal(typeof compress,                   'function', 'compress');
    assert.equal(typeof ReinforcementEngine,        'function', 'ReinforcementEngine class');
    assert.equal(typeof InMemoryReinforcementStore, 'function', 'InMemoryReinforcementStore class');
    assert.ok(reinforcement, 'reinforcement singleton must be exported');
  });

  // ── 2. Signal interpreter ────────────────────────────────────────────────────
  it('2: signal interpreter classifies file_change_event correctly', () => {
    const signal = makeTestSignal({ kind: 'file_change_event', source: 'filesystem', novelty: 0.70 });
    const result = interpretSignal(signal);

    assert.equal(result.signal_id, signal.id);
    assert.equal(result.topic, 'file_system');
    assert.ok(['low', 'medium', 'high', 'critical'].includes(result.urgency_class));
    assert.equal(result.novelty_class, 'novel', 'novelty=0.70 → novel');
    assert.equal(result.recommended_depth, 'deep', 'novel → deep');
    assert.ok(result.context_tags.includes('file_change_event'));
    assert.ok(result.context_tags.includes('filesystem'));
    assert.ok(result.interpretation_confidence > 0);
    assert.ok(result.classification_summary.length > 10);
    assert.ok(result.interpreted_at > 0);
  });

  it('2b: unknown kind → unknown novelty + low confidence', () => {
    const signal = makeTestSignal({ kind: 'unknown', raw_content: '' });
    const result = interpretSignal(signal);
    assert.equal(result.topic, 'unknown');
    assert.equal(result.novelty_class, 'unknown');
    assert.ok(result.interpretation_confidence < 0.5);
  });

  it('2c: threat_flag → critical urgency regardless of urgency value', () => {
    const signal = makeTestSignal({ threat_flag: true, urgency: 0.20 });
    assert.equal(interpretSignal(signal).urgency_class, 'critical');
  });

  it('2d: user_input always recommends deep cognition', () => {
    const signal = makeTestSignal({ kind: 'user_input', novelty: 0.10 });
    assert.equal(interpretSignal(signal).recommended_depth, 'deep');
  });

  it('2e: source_file tag added for .ts files', () => {
    const signal = makeTestSignal({
      payload: { file_path: 'src/main.ts', event_type: 'change' },
    });
    const result = interpretSignal(signal);
    assert.ok(result.context_tags.includes('source_file'), 'must tag .ts files as source_file');
    assert.ok(result.context_tags.includes('has_file_path'));
  });

  // ── 3. Evaluation engine ─────────────────────────────────────────────────────
  it('3: valid low-risk candidate passes evaluation', () => {
    const signal    = makeTestSignal();
    const candidate = makeTestCandidate();
    const result    = evaluate(candidate, signal);

    assert.ok(result.passed, 'must pass');
    assert.ok(result.score > 0);
    assert.ok(result.sve.proceed);
    assert.ok(result.cce.proceed);
    assert.equal(result.block_reason, undefined);
    assert.ok(result.evaluated_at > 0);
  });

  it('3b: empty reason causes SVE block', () => {
    const signal    = makeTestSignal();
    const candidate = makeTestCandidate({ reason: '' });
    const result    = evaluate(candidate, signal);

    assert.equal(result.passed, false);
    assert.ok(typeof result.block_reason === 'string');
    assert.ok(result.block_reason.includes('SVE'));
  });

  it('3c: path traversal in write_file causes SVE block', () => {
    const signal    = makeTestSignal();
    const candidate = makeTestCandidate({
      action: { type: 'write_file' as const, filename: '../../../etc/passwd', content: 'evil', is_reversible: false },
      reason: 'Legitimate reason text here',
    });
    const result = evaluate(candidate, signal);
    assert.equal(result.passed, false);
    assert.ok(result.block_reason!.includes('SVE'));
  });

  it('3d: evaluateAll returns results sorted by score descending', () => {
    const signal = makeTestSignal();
    const high   = makeTestCandidate({ confidence: 0.90, id: 'high' });
    const low    = makeTestCandidate({ confidence: 0.40, level: 'fallback' as const, id: 'low' });

    const results = evaluateAll([low, high], signal);
    assert.equal(results.length, 2);
    assert.ok(results[0]!.evaluation.score >= results[1]!.evaluation.score,
      'must be sorted score descending');
  });

  // ── 4. Candidate generator ───────────────────────────────────────────────────
  it('4: candidate generator produces a bounded CandidateSet', () => {
    const signal = makeTestSignal({ kind: 'cpu_utilization', urgency: 0.85,
      payload: { cpu_risk: 0.90, usage_percent: 92 } });
    const recall = { working: [], references: [], procedures: [],
      episodes: [], semantics: [], threads: [], contradictions: [] };

    const result = generateCandidates(signal, recall);

    assert.ok(result.candidates.length >= 1, 'at least one candidate');
    assert.ok(result.candidates.length <= 3, 'at most 3 candidates');
    assert.ok(result.levels_tried.length >= 1, 'at least one level tried');
    assert.ok(result.generated_at > 0);
    const best = result.candidates[0]!;
    assert.ok(best.candidate);
    assert.ok(best.level);
    assert.equal(typeof best.is_fallback, 'boolean');
    assert.ok(Array.isArray(best.memory_refs));
  });

  // ── 5. Simulation engine ─────────────────────────────────────────────────────
  it('5: depth 0 returns placeholder with unknown outcome and zero confidence', () => {
    const signal    = makeTestSignal();
    const candidate = makeTestCandidate();
    const result    = simulate(candidate, signal, { depth: 0 });

    assert.equal(result.candidate_id, candidate.id);
    assert.equal(result.projected_outcome, 'unknown');
    assert.equal(result.simulation_depth_achieved, 0);
    assert.equal(result.basis, 'placeholder');
    assert.equal(result.confidence_in_projection, 0);
    assert.ok(result.simulated_at > 0);
  });

  it('5b: depth 1 returns heuristic projection with non-zero confidence', () => {
    const signal    = makeTestSignal({ kind: 'file_change_event' });
    const candidate = makeTestCandidate({ confidence: 0.80, risk: 0.05 });
    const result    = simulate(candidate, signal, { depth: 1 });

    assert.equal(result.simulation_depth_achieved, 1);
    assert.equal(result.basis, 'heuristic');
    assert.ok(['success', 'partial', 'failure', 'unknown'].includes(result.projected_outcome));
    assert.ok(result.confidence_in_projection > 0);
    assert.ok(result.trace.length > 0);
  });

  // ── 6. Promotion policy ──────────────────────────────────────────────────────
  it('6: eligible episode (all conditions met) → PROMOTE', () => {
    const ep = makeTestEpisode({ confidence: 0.75, mvi: 0.65, trust_score: 0.70,
      created_at: Date.now() - 60_000 });
    const result = evaluatePromotion(ep, []);

    assert.ok(result.conditions.length >= 1);
    assert.ok(result.conditions.find((c) => c.name === 'min_age')?.passed);
    assert.ok(result.conditions.find((c) => c.name === 'contradiction_pressure')?.passed);
    assert.equal(result.decision, 'PROMOTE');
    assert.ok(result.reason.length > 5);
  });

  it('6b: too-young episode → DEFER with age reason', () => {
    const ep = makeTestEpisode({ created_at: Date.now() - 5_000 });
    const result = evaluatePromotion(ep, [], { minAgeMs: 30_000 });
    assert.equal(result.decision, 'DEFER');
    assert.ok(result.reason.includes('recent'));
  });

  it('6c: batch respects maxBatchSize', () => {
    const episodes = Array.from({ length: 10 }, () => makeTestEpisode());
    const result   = evaluateBatch(episodes, [], { maxBatchSize: 3 });

    assert.ok(result.promoted.length <= 3);
    assert.equal(result.promoted.length + result.deferred.length, episodes.length);
  });

  // ── 7. Consolidation engine ──────────────────────────────────────────────────
  it('7: consolidation runs three stages and prunes low-confidence episodes', () => {
    const episodes = [
      makeTestEpisode({ confidence: 0.75 }),
      makeTestEpisode({ confidence: 0.10 }),  // will be pruned
    ];
    const workingItems = Array.from({ length: 70 }, (_, i) => ({
      id: `wi-${i}`, kind: 'signal', value: `item ${i}`, priority: Math.random(),
    }));

    const result = consolidate({ episodesForBatch: episodes, workingItems });

    assert.ok(Array.isArray(result.promoted));
    assert.ok(Array.isArray(result.deferred));
    assert.ok(Array.isArray(result.pruned));
    assert.ok(result.pruned.length >= 1, 'low-confidence episode must be pruned');
    assert.ok(result.compressed_working.length <= workingItems.length);
    assert.ok(result.trace.length >= 3, 'must have at least 3 stage entries in trace');
    assert.ok(result.consolidated_at > 0);
  });

  // ── 8. Calibration surface ───────────────────────────────────────────────────
  it('8: calibration surface returns typed structured output', () => {
    // ConfidenceCalibrator
    const offset = computeCalibrationOffset([
      { predicted: 0.8, actual: true,  timestamp: Date.now() },
      { predicted: 0.6, actual: false, timestamp: Date.now() },
    ]);
    assert.equal(typeof offset.offset, 'number');
    assert.equal(offset.sample_size, 2);
    assert.equal(offset.is_significant, false);
    assert.ok(offset.computed_at > 0);

    // DriftDetector
    const drift = detectDrift({ reference: [0.1, 0.2, 0.3], current: [0.5, 0.6, 0.7] });
    assert.equal(typeof drift.score, 'number');
    assert.equal(typeof drift.is_alert, 'boolean');
    assert.ok(drift.computed_at > 0);

    // ErrorAttributor
    const attr = attributeError({ predicted: 0.8, actual: false, context: {}, occurred_at: Date.now() });
    assert.ok(['model_error', 'data_error', 'signal_error', 'unknown'].includes(attr.error_type));
    assert.ok(attr.computed_at > 0);

    // ThresholdAdjuster
    const threshold = { id: 'test_threshold', current: 0.30, min: 0.10, max: 0.80 };
    const adj = suggestThresholdAdjustment(threshold, offset);
    assert.equal(adj.threshold_id, 'test_threshold');
    assert.equal(adj.delta, 0);
    assert.equal(adj.should_apply, false);
    assert.ok(adj.computed_at > 0);
  });

  // ── 9. Compression engine ─────────────────────────────────────────────────────
  it('9: prune_low drops below-floor items', () => {
    const items = [
      { id: 'a', kind: 'signal', value: 'A', priority: 0.90 },
      { id: 'b', kind: 'signal', value: 'B', priority: 0.50 },
      { id: 'c', kind: 'signal', value: 'C', priority: 0.05 },
      { id: 'd', kind: 'signal', value: 'D', priority: 0.08 },
    ];
    const result = compress(items, '', undefined, { strategy: 'prune_low', priorityFloor: 0.15 });

    assert.ok(result.compressed.length < items.length);
    assert.ok(result.dropped.includes('c'));
    assert.ok(result.dropped.includes('d'));
    assert.ok(result.reduction_ratio < 1.0);
    assert.equal(result.strategy, 'prune_low');
  });

  it('9b: dedup keeps highest priority per kind', () => {
    const items = [
      { id: 'a1', kind: 'signal', value: 'A low',  priority: 0.40 },
      { id: 'a2', kind: 'signal', value: 'A high', priority: 0.90 },
      { id: 'b1', kind: 'event',  value: 'B',       priority: 0.60 },
    ];
    const result = compress(items, '', undefined, { strategy: 'dedup' });

    assert.ok(result.compressed.some((i) => i.id === 'a2'), 'must keep a2 (higher priority)');
    assert.ok(!result.compressed.some((i) => i.id === 'a1'), 'must drop a1');
    assert.equal(result.strategy, 'dedup');
  });

  it('9c: empty input returns empty result', () => {
    const result = compress([]);
    assert.equal(result.compressed.length, 0);
    assert.equal(result.dropped.length, 0);
    assert.equal(result.reduction_ratio, 1.0);
  });

  it('9d: maxOutput cap is respected', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`, kind: 'signal', value: `val${i}`, priority: Math.random(),
    }));
    const result = compress(items, '', 5);
    assert.ok(result.compressed.length <= 5, 'must not exceed maxOutput');
  });

  // ── 10. Reinforcement engine ─────────────────────────────────────────────────
  it('10: injected store — reinforce, decay, decayAll work correctly', () => {
    const store  = new InMemoryReinforcementStore();
    const engine = new ReinforcementEngine(store);

    engine.register({ id: 'story-001', trust: 0.60 });
    engine.reinforce('story-001', 0.15);

    const trust = engine.getTrust('story-001');
    assert.ok(trust !== undefined);
    assert.ok(trust > 0.60, `trust must increase (got ${trust})`);
    assert.ok(trust <= 1.0);

    engine.decay('story-001');
    const decayed = engine.getTrust('story-001');
    assert.ok(decayed! < trust!, 'must decrease after decay');

    // decayAll skips entries in keepIds
    engine.register({ id: 'story-002', trust: 0.70 });
    const before = engine.getTrust('story-002')!;
    engine.decayAll(new Set(['story-002']));
    assert.equal(engine.getTrust('story-002'), before, 'kept entry must not be decayed');

    // nonexistent id is no-op
    assert.doesNotThrow(() => engine.reinforce('nonexistent', 0.5));
  });

  it('10b: singleton is exported and functional', () => {
    assert.ok(reinforcement);
    reinforcement.register({ id: 'singleton-test', trust: 0.5 });
    assert.doesNotThrow(() => reinforcement.decay('singleton-test'));
    assert.doesNotThrow(() => reinforcement.decayAll(new Set()));
  });

  // ── 11. Contradiction store (preserved as-is) ─────────────────────────────────
  it('11: contradiction store evaluates suppression correctly', () => {
    clearAll();

    const signal = makeTestSignal({ kind: 'cpu_utilization', source: 'telemetry' });

    const noSupp = evaluateSuppression(signal, 'display_text');
    assert.equal(noSupp.should_block, false);
    assert.equal(noSupp.votes.length, 0);

    recordContradiction(signal, 'display_text', 0.85);
    assert.ok(getActive().length >= 1);

    const withSupp = evaluateSuppression(signal, 'display_text');
    assert.ok(withSupp.votes.length >= 1);

    clearAll();  // restore
  });

});
