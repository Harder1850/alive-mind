/**
 * Synthesizer — alive-mind
 * alive-mind/src/decisions/synthesize.ts
 *
 * Cognitive module. Imports contracts from alive-constitution only.
 * Does NOT execute actions. Does NOT define law.
 * Called by alive-runtime via mind-bridge — does NOT call alive-runtime.
 *
 * Priority stack (v16 §30.2):
 *   Level 1 — Procedure  (Slice 3 — stub null)
 *   Level 2 — Rule       (Slice 1 — ACTIVE)
 *   Level 3 — Episode    (Slice 3 — stub null)
 *   Level 4 — Semantic   (Slice 3 — stub null)
 *   Level 5 — LLM        (Slice 3 — stub null, must be non-blocking when added)
 *   Level 6 — Fallback   (always active)
 *
 * Fail closed: unimplemented levels return null — never throw, never simulate.
 */

import type { Signal } from '../../../../alive-constitution/contracts/signal';
import type { Action } from '../../../../alive-constitution/contracts/action';
import { matchRule }   from '../memory/rule-store';

export interface ActionCandidate {
  id:               string;
  action:           Action;
  level:            SynthesizerLevel;
  reason:           string;
  confidence:       number;
  risk:             number;
  source_memories:  string[];
}

export type SynthesizerLevel = 'procedure' | 'rule' | 'episode' | 'semantic' | 'llm' | 'fallback';

// Stubs — fail closed
function tryProcedure(_s: Signal): ActionCandidate | null { return null; }
function tryEpisode(_s: Signal):   ActionCandidate | null { return null; }
function trySemantic(_s: Signal):  ActionCandidate | null { return null; }
function tryLLM(_s: Signal):       ActionCandidate | null { return null; }

function tryRule(signal: Signal): ActionCandidate | null {
  const match = matchRule(signal);
  if (!match) return null;
  return {
    id:              crypto.randomUUID(),
    action:          match.action,
    level:           'rule',
    reason:          `rule:${match.rule.id} — ${match.rule.description}`,
    confidence:      match.confidence,
    risk:            match.risk,
    source_memories: [],
  };
}

function fallback(signal: Signal): ActionCandidate {
  return {
    id:     crypto.randomUUID(),
    action: {
      type:    'display_text',
      payload: `[ALIVE] Signal received (kind=${signal.kind}, urgency=${signal.urgency.toFixed(2)}). No specific response pattern matched. Monitoring.`,
    },
    level:           'fallback',
    reason:          'No rule, episode, or semantic match found. Surfacing to human.',
    confidence:      0.5,
    risk:            0.0,
    source_memories: [],
  };
}

export interface SynthesisResult {
  candidate:              ActionCandidate;
  levelsTriedBeforMatch:  SynthesizerLevel[];
}

export function synthesize(signal: Signal): SynthesisResult {
  const tried: SynthesizerLevel[] = [];

  tried.push('procedure');
  const procedure = tryProcedure(signal);
  if (procedure) return { candidate: procedure, levelsTriedBeforMatch: tried };

  tried.push('rule');
  const rule = tryRule(signal);
  if (rule) return { candidate: rule, levelsTriedBeforMatch: tried };

  tried.push('episode');
  const episode = tryEpisode(signal);
  if (episode) return { candidate: episode, levelsTriedBeforMatch: tried };

  tried.push('semantic');
  const semantic = trySemantic(signal);
  if (semantic) return { candidate: semantic, levelsTriedBeforMatch: tried };

  tried.push('llm');
  const llm = tryLLM(signal);
  if (llm) return { candidate: llm, levelsTriedBeforMatch: tried };

  tried.push('fallback');
  return { candidate: fallback(signal), levelsTriedBeforMatch: tried };
}
