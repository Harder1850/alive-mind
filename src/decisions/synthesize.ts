/**
 * Synthesizer — alive-mind
 * alive-mind/src/decisions/synthesize.ts
 *
 * Cognitive module. Imports from alive-constitution only.
 * Does NOT execute. Does NOT call alive-runtime.
 * Called by alive-runtime via cycle.ts — the ONLY entry point.
 *
 * Priority stack (v16 §30.2):
 *   Level 1 — Procedure  (Slice 3 — null)
 *   Level 2 — Rule       (Slice 1 — ACTIVE)
 *   Level 3 — Episode    (Slice 3 — null)
 *   Level 4 — Semantic   (Slice 3 — null)
 *   Level 5 — LLM        (Slice 3 — null, must be non-blocking when added)
 *   Level 6 — Fallback   (always active)
 *
 * Fail closed: unimplemented levels return null — never throw, never simulate.
 */

import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Action } from '../../../alive-constitution/contracts/action';
import { matchRule }   from '../memory/rule-store';

export interface ActionCandidate {
  id:              string;
  action:          Action;
  level:           SynthesizerLevel;
  reason:          string;
  confidence:      number;
  risk:            number;
  source_memories: string[];
}

export type SynthesizerLevel =
  | 'procedure' | 'rule' | 'episode'
  | 'semantic'  | 'llm'  | 'fallback';

export interface SynthesisResult {
  candidate:             ActionCandidate;
  levelsTriedBeforeMatch: SynthesizerLevel[];
}

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
    id: crypto.randomUUID(),
    action: {
      type:    'display_text',
      payload: `[ALIVE] Signal received (kind=${signal.kind}, urgency=${signal.urgency.toFixed(2)}). No pattern matched. Monitoring.`,
    },
    level:           'fallback',
    reason:          'No rule, episode, or semantic match. Surfacing to human.',
    confidence:      0.5,
    risk:            0.0,
    source_memories: [],
  };
}

export function synthesize(signal: Signal): SynthesisResult {
  const tried: SynthesizerLevel[] = [];

  tried.push('procedure');
  const procedure = tryProcedure(signal);
  if (procedure) return { candidate: procedure, levelsTriedBeforeMatch: tried };

  tried.push('rule');
  const rule = tryRule(signal);
  if (rule) return { candidate: rule, levelsTriedBeforeMatch: tried };

  tried.push('episode');
  const episode = tryEpisode(signal);
  if (episode) return { candidate: episode, levelsTriedBeforeMatch: tried };

  tried.push('semantic');
  const semantic = trySemantic(signal);
  if (semantic) return { candidate: semantic, levelsTriedBeforeMatch: tried };

  tried.push('llm');
  const llm = tryLLM(signal);
  if (llm) return { candidate: llm, levelsTriedBeforeMatch: tried };

  tried.push('fallback');
  return { candidate: fallback(signal), levelsTriedBeforeMatch: tried };
}
