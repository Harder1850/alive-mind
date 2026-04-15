/**
 * Synthesizer — alive-mind
 * alive-mind/src/decisions/synthesize.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 * Called by alive-runtime via mind-bridge — does NOT call alive-runtime.
 *
 * Slice 4: SVE + CCE + ARE wired into the validation pipeline.
 * Candidates rejected by SVE or CCE fall through to the next level.
 *
 * Fail closed: unimplemented levels return null — never throw, never simulate.
 */

import type { Signal } from '../../../alive-constitution/contracts';
import type { Action } from '../../../alive-constitution/contracts/action';
import { matchRule }   from '../memory/rule-store';
import { validate,      type SVEResult  } from '../cognition/sve';
import { scoreCandidate, type CCEResult } from '../cognition/cce';
import { challenge,     type AREResult  } from '../cognition/are';

// Optional Slice 3 memory modules — fail closed if absent
let episodeStore:  { recall: (s: Signal) => ActionCandidate | null } | null = null;
let semanticGraph: { query:  (s: Signal) => ActionCandidate | null } | null = null;
try { episodeStore  = require('../memory/episode-store');  } catch { /* Slice 3 absent */ }
try { semanticGraph = require('../memory/semantic-graph'); } catch { /* Slice 3 absent */ }

export interface ActionCandidate {
  id:               string;
  action:           Action;
  level:            SynthesizerLevel;
  reason:           string;
  confidence:       number;
  risk:             number;
  source_memories:  string[];
  sve?:             SVEResult;
  cce?:             CCEResult;
  are?:             AREResult;
}

export type SynthesizerLevel = 'procedure' | 'rule' | 'episode' | 'semantic' | 'llm' | 'fallback';

function tryProcedure(_s: Signal): ActionCandidate | null { return null; }
function tryLLM(_s: Signal):       ActionCandidate | null { return null; }

function validateCandidate(candidate: ActionCandidate, signal: Signal, predictionAccuracy?: number, evidenceCount?: number): ActionCandidate | null {
  const sve = validate(candidate);
  if (!sve.proceed) { console.log(`[SVE] FAIL — ${sve.reason}`); return null; }

  const cce = scoreCandidate({ candidate, signal, prediction_accuracy: predictionAccuracy, evidence_count: evidenceCount, source_trust: candidate.confidence });
  const are = challenge(candidate, signal);

  const finalConfidence = Math.min(1.0, Math.max(0.0, cce.adjusted_confidence + are.confidence_adjustment));
  const finalRisk       = Math.min(1.0, Math.max(0.0, candidate.risk + are.risk_adjustment));

  const validated: ActionCandidate = { ...candidate, confidence: finalConfidence, risk: finalRisk, sve, cce, are };

  if (!cce.proceed) { console.log(`[CCE] REJECT — ${cce.reason}`); return null; }
  if (sve.verdict === 'warn') console.log(`[SVE] WARN — ${sve.reason}`);
  if (are.fired) console.log(`[ARE] ${are.summary}`);

  return validated;
}

function tryRule(signal: Signal): ActionCandidate | null {
  const match = matchRule(signal);
  if (!match) return null;
  return { id: crypto.randomUUID(), action: match.action, level: 'rule', reason: `rule:${match.rule.id} — ${match.rule.description}`, confidence: match.confidence, risk: match.risk, source_memories: [] };
}

function tryEpisode(signal: Signal): ActionCandidate | null {
  return episodeStore?.recall(signal) ?? null;
}

function trySemantic(signal: Signal): ActionCandidate | null {
  return semanticGraph?.query(signal) ?? null;
}

function fallback(signal: Signal): ActionCandidate {
  return { id: crypto.randomUUID(), action: { type: 'display_text', payload: `[ALIVE] Signal received (kind=${signal.kind}, urgency=${signal.urgency.toFixed(2)}). No specific response pattern matched. Monitoring.` }, level: 'fallback', reason: 'No rule, episode, or semantic match found. Surfacing to human.', confidence: 0.5, risk: 0.0, source_memories: [] };
}

export interface SynthesisResult {
  candidate:             ActionCandidate;
  levelsTriedBeforMatch: SynthesizerLevel[];
}

export function synthesize(signal: Signal, predictionAccuracy?: number, evidenceCount?: number): SynthesisResult {
  const tried: SynthesizerLevel[] = [];

  const attempt = (level: SynthesizerLevel, raw: ActionCandidate | null): ActionCandidate | null => {
    tried.push(level);
    if (!raw) return null;
    if (level === 'fallback') return raw;
    return validateCandidate(raw, signal, predictionAccuracy, evidenceCount);
  };

  const procedure = attempt('procedure', tryProcedure(signal));
  if (procedure) return { candidate: procedure, levelsTriedBeforMatch: tried };

  const rule = attempt('rule', tryRule(signal));
  if (rule) return { candidate: rule, levelsTriedBeforMatch: tried };

  const episode = attempt('episode', tryEpisode(signal));
  if (episode) return { candidate: episode, levelsTriedBeforMatch: tried };

  const semantic = attempt('semantic', trySemantic(signal));
  if (semantic) return { candidate: semantic, levelsTriedBeforMatch: tried };

  const llm = attempt('llm', tryLLM(signal));
  if (llm) return { candidate: llm, levelsTriedBeforMatch: tried };

  tried.push('fallback');
  return { candidate: fallback(signal), levelsTriedBeforMatch: tried };
}
