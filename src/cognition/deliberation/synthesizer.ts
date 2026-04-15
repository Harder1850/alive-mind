/**
 * Synthesizer — alive-mind's multi-level cognitive synthesis chain.
 *
 * The Synthesizer sits between the STG (gate) and the full reasoning engine.
 * It tries the cheapest, most confident paths first; only escalates when
 * lower levels cannot produce a confident answer.
 *
 *   Level 1 — Reflex / story match   (derived-memory, trust >= 0.7)
 *   Level 2 — Rule store match       (v16 §31.7 rules — this module)
 *   Level 3 → …                      (handled by reasoning-engine.ts tiers)
 *
 * Level 2 iterates the RULE_STORE in priority order. The first rule whose
 * condition returns true wins; its Action is returned immediately. If no
 * rule fires, null is returned so the caller escalates to Level 3+.
 *
 * All contracts import from alive-constitution/contracts/.
 */

import type { Signal } from '../../../../alive-constitution/contracts';
import type { Action } from '../../../../alive-constitution/contracts/action';
import type { ASMState } from '../../spine/state-model';
import { RULE_STORE } from '../../decisions/rule-store';

// ---------------------------------------------------------------------------
// Level 2 — Rule store match
// ---------------------------------------------------------------------------

/**
 * Evaluate the §31.7 rule store against the current signal and ASM state.
 *
 * Returns the matched rule's Action (and logs the match), or null when no
 * rule fires so the caller can proceed to Level 3 (cross-domain reasoning).
 */
export function synthesizerLevel2(signal: Signal, state: ASMState): Action | null {
  for (const rule of RULE_STORE) {
    if (rule.condition(signal, state)) {
      console.log(
        `[SYNTHESIZER L2] Rule fired: id=${rule.id} ` +
        `reason="${rule.reason}"`,
      );
      return rule.action;
    }
  }
  return null;
}
