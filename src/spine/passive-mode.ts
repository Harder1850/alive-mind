/**
 * PASSIVE MODE HOOK — alive-mind
 * LOCKDOWN MODE IMPLEMENTATION — Slice 1.5
 *
 * Provides passive/hibernate behavior for the mind during LOCKDOWN mode.
 * In LOCKDOWN:
 *   - Mind returns no-op / empty candidates
 *   - No learning
 *   - No memory mutation
 *   - No simulation
 *   - No autonomous behavior
 *
 * This is a minimal passive mode hook - no architecture changes needed.
 */

import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Decision } from '../../../alive-constitution/contracts/decision';
import { computeDecisionIntegrityHash } from '../../../alive-constitution/contracts/decision';

/**
 * Check if mind should operate in passive mode.
 * This is a simple flag-based check - in production would query runtime.
 */
let isPassiveMode = false;

/**
 * Set passive mode state.
 * Called by runtime when entering/exiting LOCKDOWN.
 */
export function setPassiveMode(passive: boolean): void {
  isPassiveMode = passive;
}

/**
 * Check if mind is in passive mode.
 */
export function isPassive(): boolean {
  return isPassiveMode;
}

/**
 * Passive mode think function.
 * Returns an empty/no-op decision that will be rejected by runtime in LOCKDOWN.
 */
export function thinkPassive(signal: Signal): Decision {
  // Return a no-op decision with empty action
  // This will be blocked by the runtime lockdown gate
  const noOpAction = {
    type: 'display_text' as const,
    payload: '[PASSIVE MODE] Mind is in lockdown - no decisions generated',
  };

  const partial = {
    id: crypto.randomUUID(),
    selected_action: noOpAction,
    confidence: 0,
    admissibility_status: 'blocked' as const, // Mark as blocked - will be rejected
    reason: 'Mind is in passive/hibernate mode during LOCKDOWN',
  };

  const integrity_hash = computeDecisionIntegrityHash(partial);

  return { ...partial, integrity_hash };
}

/**
 * Passive mode synthesize - returns empty candidate.
 * Called by mind-loop when in passive mode.
 */
export function synthesizePassive(): {
  action: { type: 'display_text'; payload: string };
  confidence: number;
  reason: string;
} {
  return {
    action: {
      type: 'display_text',
      payload: '[PASSIVE MODE] No cognitive activity during lockdown',
    },
    confidence: 0,
    reason: 'Passive mode: cognitive cycle suspended',
  };
}

/**
 * Check if learning should be allowed.
 * In LOCKDOWN, no learning occurs.
 */
export function isLearningAllowed(): boolean {
  return !isPassiveMode;
}

/**
 * Check if memory writes are allowed.
 * In LOCKDOWN, no memory mutations.
 */
export function isMemoryWriteAllowed(): boolean {
  return !isPassiveMode;
}

/**
 * Check if simulation is allowed.
 * In LOCKDOWN, no simulation runs.
 */
export function isSimulationAllowed(): boolean {
  return !isPassiveMode;
}

/**
 * Check if autonomous loops should run.
 * In LOCKDOWN, background loops are suspended.
 */
export function areAutonomousLoopsAllowed(): boolean {
  return !isPassiveMode;
}
