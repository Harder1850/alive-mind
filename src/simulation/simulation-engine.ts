/**
 * Simulation Engine — alive-mind (SKELETON)
 * src/simulation/simulation-engine.ts
 *
 * Mental simulation of candidate outcomes before committing.
 * Bounded skeleton — all projection formulas are placeholders.
 *
 * Purpose:
 *   Before a candidate is sent to runtime for whitelist enforcement, the
 *   simulation engine projects what outcome would likely result if the action
 *   were executed. This gives the evaluation engine additional signal beyond
 *   the static risk/confidence scores.
 *
 * Current status:
 *   - Interfaces and output shapes are finalized.
 *   - Simulation depth 0 (none) is fully implemented.
 *   - Depth 1 (shallow projection) returns placeholder values with proper types.
 *   - Depth 2 (deep multi-step) is a stub returning depth-1 output.
 *
 * Doctrine-sensitive: all projection formulas are marked NOT FINALIZED.
 *   projected_outcome probability arithmetic is left undefined.
 *   state_delta projection is left as a string description only.
 *   confidence_in_projection is a rough heuristic, not a calibrated value.
 *
 * Design rules:
 *   - No side effects. No FS, no network, no execution.
 *   - All outputs are read-only projections — never instructions.
 *   - The engine must not produce Actions. It only projects likely outcomes.
 *   - Returns structured placeholder outputs when projection is not yet implemented.
 */

import type { Signal }          from '../../../../alive-constitution/contracts';
import type { ActionCandidate } from '../decisions/synthesize';

// ── Simulation depth ───────────────────────────────────────────────────────────

/**
 * How deeply to simulate the candidate action.
 *   0 = no simulation (fast-path, returns immediate signal-based projection)
 *   1 = shallow projection (one step: what does this action produce?)
 *   2 = deep multi-step (traces cascading state changes — NOT IMPLEMENTED)
 */
export type SimulationDepth = 0 | 1 | 2;

// ── Output shapes ──────────────────────────────────────────────────────────────

/**
 * Projected outcome classification.
 * 'unknown' = simulation could not produce a confident projection.
 */
export type ProjectedOutcome = 'success' | 'partial' | 'failure' | 'unknown';

/**
 * The result of simulating a candidate action.
 */
export interface SimulationResult {
  /** Which candidate was simulated. */
  candidate_id: string;

  /** Projected outcome if this action were executed. */
  projected_outcome: ProjectedOutcome;

  /**
   * Rough textual description of what state change would result.
   * Grounded in candidate.action.type and signal.kind — not invented.
   *
   * TODO(doctrine): structured state delta model (not yet finalized).
   */
  projected_state_delta: string;

  /**
   * Projected risk after execution — may differ from candidate.risk if simulation
   * reveals downstream effects.
   *
   * TODO(doctrine): formula not finalized.
   * Current: same as candidate.risk (passthrough).
   */
  risk_projection: number;

  /**
   * How confident we are in this projection (0.0–1.0).
   * Depth 0 → 0.0 (no simulation performed).
   * Depth 1 → rough heuristic based on action type known-ness.
   * Depth 2 → not implemented.
   *
   * TODO(doctrine): proper calibration.
   */
  confidence_in_projection: number;

  /**
   * How deeply the simulation was performed.
   * Matches the requested depth when possible; may be less if depth is unavailable.
   */
  simulation_depth_achieved: SimulationDepth;

  /**
   * Basis for the projection.
   * 'placeholder' = formulas not yet implemented, structural output only.
   * 'heuristic'   = rule-based approximation from action type + signal kind.
   * 'model'       = TODO — not yet available.
   */
  basis: 'placeholder' | 'heuristic';

  /**
   * Trace of reasoning steps for debugging.
   * Grounded — each entry maps to a real decision made in the simulation.
   */
  trace: string[];

  /** Epoch ms when simulation completed. */
  simulated_at: number;
}

// ── Config ─────────────────────────────────────────────────────────────────────

export interface SimulationConfig {
  /** Target simulation depth. Default 0 (no simulation). */
  depth: SimulationDepth;
}

// ── Depth 0: No simulation ─────────────────────────────────────────────────────

function simulateDepth0(candidate: ActionCandidate): SimulationResult {
  return {
    candidate_id:              candidate.id,
    projected_outcome:         'unknown',
    projected_state_delta:     'Simulation not performed (depth=0).',
    risk_projection:           candidate.risk,
    confidence_in_projection:  0.0,
    simulation_depth_achieved: 0,
    basis:                     'placeholder',
    trace:                     ['depth=0: simulation skipped'],
    simulated_at:              Date.now(),
  };
}

// ── Depth 1: Shallow projection ───────────────────────────────────────────────
//
// TODO(doctrine): replace heuristic table with calibrated projection formulas.
// Current approach: lookup table mapping (action_type, signal_kind) → approximate outcome.
// This produces plausible structured output without fabricating probabilities.

/** Known action types that are highly reversible with minimal state change. */
const KNOWN_SAFE_ACTION_TYPES = new Set([
  'display_text',  // constitution type
]);

/** Signal kinds where we have enough structural knowledge to project. */
const PROJECTABLE_SIGNAL_KINDS = new Set([
  'file_change_event', 'cpu_utilization', 'disk_available',
  'process_error', 'repo_commit', 'user_input',
]);

function simulateDepth1(candidate: ActionCandidate, signal: Signal): SimulationResult {
  const trace: string[] = ['depth=1: shallow projection'];
  const actionType = candidate.action.type;
  const isKnownSafe = KNOWN_SAFE_ACTION_TYPES.has(actionType);
  const isProjectable = PROJECTABLE_SIGNAL_KINDS.has(signal.kind);

  // TODO(doctrine): replace confidence heuristic with calibrated formula
  const confidenceInProjection = isProjectable ? (isKnownSafe ? 0.55 : 0.35) : 0.20;

  let projectedOutcome: ProjectedOutcome;
  let projectedStateDelta: string;

  if (actionType === 'display_text') {
    projectedOutcome    = candidate.confidence >= 0.6 ? 'success' : 'partial';
    projectedStateDelta = `Display text produced — no filesystem or process state change.`;
    trace.push(`action=display_text → no state change expected`);
  } else if (actionType === 'write_file') {
    // Write file: success when risk is low, partial/failure when high
    projectedOutcome    = candidate.risk < 0.3 ? 'success' : candidate.risk < 0.6 ? 'partial' : 'failure';
    const filename      = (candidate.action as Extract<typeof candidate.action, { type: 'write_file' }>).filename ?? '(unknown)';
    projectedStateDelta = `File write to "${filename}" — filesystem state change expected.`;
    trace.push(`action=write_file → filesystem change, risk=${candidate.risk.toFixed(2)}`);
  } else {
    projectedOutcome    = 'unknown';
    projectedStateDelta = `Unknown action type "${actionType}" — cannot project.`;
    trace.push(`action=${actionType} → unknown projection`);
  }

  if (!isProjectable) {
    trace.push(`signal.kind="${signal.kind}" → limited projection confidence`);
  }

  return {
    candidate_id:              candidate.id,
    projected_outcome:         projectedOutcome,
    projected_state_delta:     projectedStateDelta,
    risk_projection:           candidate.risk,  // TODO(doctrine): compound risk formula
    confidence_in_projection:  confidenceInProjection,
    simulation_depth_achieved: 1,
    basis:                     'heuristic',
    trace,
    simulated_at:              Date.now(),
  };
}

// ── Depth 2: Multi-step (stub) ─────────────────────────────────────────────────
// NOT IMPLEMENTED. Returns depth-1 output with a trace note.
// TODO: implement cascading state-change simulation when doctrine is finalized.

function simulateDepth2(candidate: ActionCandidate, signal: Signal): SimulationResult {
  const shallow = simulateDepth1(candidate, signal);
  return {
    ...shallow,
    simulation_depth_achieved: 1,  // achieved depth stays at 1 — depth 2 not available
    trace: [...shallow.trace, 'depth=2: not implemented — returned depth-1 result'],
  };
}

// ── Main simulation entry point ────────────────────────────────────────────────

/**
 * Simulate the likely outcome of executing a candidate action.
 *
 * @param candidate  The candidate to simulate. Must have passed SVE.
 * @param signal     The originating signal. Provides context for projection.
 * @param config     Optional simulation config. Depth defaults to 0.
 * @returns          SimulationResult — always returns a result, never throws.
 */
export function simulate(
  candidate: ActionCandidate,
  signal:    Signal,
  config:    Partial<SimulationConfig> = {},
): SimulationResult {
  const depth = config.depth ?? 0;

  switch (depth) {
    case 1:  return simulateDepth1(candidate, signal);
    case 2:  return simulateDepth2(candidate, signal);
    case 0:
    default: return simulateDepth0(candidate);
  }
}
