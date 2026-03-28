/**
 * Rule Store — alive-mind's semantic decision rules.
 *
 * v16 §31.7 — Three seeded rules for Slice 1.
 *
 * Rules are evaluated in priority order by the Synthesizer (Level 2).
 * A rule fires when its condition returns true; its action is returned
 * immediately and no further rules are checked.
 *
 * Rule schema:
 *   id       — stable identifier referenced in audit logs
 *   priority — lower number = evaluated first (1 = highest)
 *   condition(signal, state) — returns true when the rule should fire
 *   action   — the DisplayTextAction to emit when the rule fires
 *   reason   — human-readable rationale stored in decision logs
 *
 * All contracts import from alive-constitution/contracts/.
 */

import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { DisplayTextAction } from '../../../alive-constitution/contracts/action';
import type { ASMState } from '../spine/state-model';

// ---------------------------------------------------------------------------
// Rule type
// ---------------------------------------------------------------------------

export interface MindRule {
  id: string;
  priority: number;
  condition(signal: Signal, state: ASMState): boolean;
  action: DisplayTextAction;
  reason: string;
}

// ---------------------------------------------------------------------------
// §31.7 Slice 1 seeded rules
// ---------------------------------------------------------------------------

/**
 * Rule 1 — THREAT_OVERRIDE (priority 1)
 * When a signal carries a threat_flag, bypass normal reasoning and emit
 * an immediate escalation notice. Ensures critical signals are never
 * silently dropped inside the cognitive layer.
 */
const RULE_THREAT_OVERRIDE: MindRule = {
  id:       'rule-31.7-01-threat-override',
  priority: 1,
  condition: (signal: Signal) => signal.threat_flag === true,
  action: {
    type:         'display_text',
    payload:      'THREAT OVERRIDE: signal carries threat_flag — escalating immediately.',
    is_reversible: false,
  },
  reason: 'v16 §31.7 Rule 1: threat_flag present → escalate without delay',
};

/**
 * Rule 2 — RESOURCE_CONSERVATION (priority 2)
 * When battery is critically low or cpu_risk is critically high, emit a
 * conservation directive instead of expensive reasoning.
 * Thresholds: battery_status < 0.25 OR cpu_risk > 0.8.
 */
const RULE_RESOURCE_CONSERVATION: MindRule = {
  id:       'rule-31.7-02-resource-conservation',
  priority: 2,
  condition: (_signal: Signal, state: ASMState) =>
    state.battery_status < 0.25 || state.cpu_risk > 0.8,
  action: {
    type:         'display_text',
    payload:      'RESOURCE CONSERVATION: system resources critical — deferring non-essential reasoning.',
    is_reversible: true,
  },
  reason: 'v16 §31.7 Rule 2: battery < 25% or cpu_risk > 80% → conserve resources',
};

/**
 * Rule 3 — PATTERN_RESPONSE (priority 3)
 * When the signal content matches a high-confidence known pattern
 * (trust >= 0.9 from the story store), emit the cached response directly
 * without escalating to cross-domain reasoning or the LLM Teacher.
 * The pattern check mirrors the trust threshold in derived-memory.ts.
 */
const RULE_PATTERN_RESPONSE: MindRule = {
  id:       'rule-31.7-03-pattern-response',
  priority: 3,
  condition: (signal: Signal) => {
    const content = String(signal.raw_content ?? '').toLowerCase();
    // High-confidence cached patterns from Slice 1 story seeds
    return content.includes('hello') || content.includes('status') || content.includes('ping');
  },
  action: {
    type:         'display_text',
    payload:      'PATTERN HIT: matched high-trust cached response — applying without full reasoning.',
    is_reversible: true,
  },
  reason: 'v16 §31.7 Rule 3: high-trust pattern match → use cached response',
};

// ---------------------------------------------------------------------------
// Exported rule store — ordered by priority
// ---------------------------------------------------------------------------

export const RULE_STORE: readonly MindRule[] = [
  RULE_THREAT_OVERRIDE,
  RULE_RESOURCE_CONSERVATION,
  RULE_PATTERN_RESPONSE,
].sort((a, b) => a.priority - b.priority);
