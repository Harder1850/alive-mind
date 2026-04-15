/**
 * Contradiction Store — alive-mind
 * alive-mind/src/memory/contradiction-store.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 *
 * Tracks contradictions between what ALIVE predicted and what actually happened.
 * Active suppressors vote against future candidates that resemble the failed pattern.
 * Decay prevents stale suppressors from blocking indefinitely.
 *
 * Rules (v16 §9.10):
 *   - Contradictions are NEVER silently resolved by arbitrary selection
 *   - Lower-confidence node is demoted and flagged — never deleted
 *   - If unresolvable by policy: held, escalated for clarification
 *   - Suppressor strength decays each tick so old failures don't block forever
 *
 * Slice 4 implementation.
 */

import type { Signal } from '../../../alive-constitution/contracts';

export interface Contradiction {
  id:                 string;
  signal_kind:        string;
  signal_source:      string;
  failed_action_type: string;
  strength:           number;
  initial_strength:   number;
  source_confidence:  number;
  created_at:         number;
  last_evaluated_at:  number;
  failure_count:      number;
  resolved:           boolean;
  resolution_reason?: string;
}

export interface SuppressionVote {
  contradiction_id: string;
  strength:         number;
  reason:           string;
}

export interface SuppressionResult {
  total_pressure: number;
  votes:          SuppressionVote[];
  should_block:   boolean;
}

const INITIAL_STRENGTH       = 0.6;
const STRENGTH_PER_FAILURE   = 0.15;
const MAX_STRENGTH           = 0.95;
const DECAY_RATE_PER_SEC     = 0.0017;
const BLOCK_THRESHOLD        = 0.75;
const PRUNE_THRESHOLD        = 0.05;

const contradictions = new Map<string, Contradiction>();

function contradictionKey(sk: string, ss: string, at: string): string {
  return `${sk}:${ss}:${at}`;
}

function applyDecay(c: Contradiction): Contradiction {
  const now        = Date.now();
  const elapsedSec = (now - c.last_evaluated_at) / 1000;
  return { ...c, strength: Math.max(0, c.strength - DECAY_RATE_PER_SEC * elapsedSec), last_evaluated_at: now };
}

export function recordContradiction(signal: Signal, failedActionType: string, sourceConfidence: number): Contradiction {
  const key      = contradictionKey(signal.kind, signal.source, failedActionType);
  const existing = contradictions.get(key);
  if (existing) {
    const updated = { ...existing, strength: Math.min(MAX_STRENGTH, existing.strength + STRENGTH_PER_FAILURE), failure_count: existing.failure_count + 1, last_evaluated_at: Date.now() };
    contradictions.set(key, updated);
    return updated;
  }
  const strength = Math.min(MAX_STRENGTH, INITIAL_STRENGTH * sourceConfidence);
  const c: Contradiction = { id: crypto.randomUUID(), signal_kind: signal.kind, signal_source: signal.source, failed_action_type: failedActionType, strength, initial_strength: strength, source_confidence: sourceConfidence, created_at: Date.now(), last_evaluated_at: Date.now(), failure_count: 1, resolved: false };
  contradictions.set(key, c);
  return c;
}

export function evaluateSuppression(signal: Signal, actionType: string): SuppressionResult {
  const votes: SuppressionVote[] = [];
  for (const [key, raw] of contradictions.entries()) {
    if (raw.resolved) continue;
    const c = applyDecay(raw);
    contradictions.set(key, c);
    if (c.strength < PRUNE_THRESHOLD) { contradictions.delete(key); continue; }
    if (c.signal_kind === signal.kind && c.failed_action_type === actionType) {
      votes.push({ contradiction_id: c.id, strength: c.strength, reason: `Pattern ${c.signal_kind}→${c.failed_action_type} failed ${c.failure_count}x (strength=${c.strength.toFixed(3)})` });
    }
  }
  const total_pressure = Math.min(1.0, votes.reduce((s, v) => s + v.strength, 0));
  return { total_pressure, votes, should_block: total_pressure >= BLOCK_THRESHOLD };
}

export function resolveContradiction(id: string, reason: string): boolean {
  for (const [key, c] of contradictions.entries()) {
    if (c.id === id) { contradictions.set(key, { ...c, resolved: true, resolution_reason: reason }); return true; }
  }
  return false;
}

export function decayAll(): void {
  for (const [key, c] of contradictions.entries()) {
    if (c.resolved) continue;
    const d = applyDecay(c);
    if (d.strength < PRUNE_THRESHOLD) { contradictions.delete(key); } else { contradictions.set(key, d); }
  }
}

export function getActive(): Contradiction[] {
  return Array.from(contradictions.values()).filter(c => !c.resolved && c.strength >= PRUNE_THRESHOLD);
}

export function getAll(): Contradiction[] {
  return Array.from(contradictions.values());
}

export function clearAll(): void {
  contradictions.clear();
}
