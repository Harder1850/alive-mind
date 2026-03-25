/**
 * Authoritative State Model (ASM) — alive-mind's official picture of reality.
 *
 * The ASM is the single source of truth for the cognitive layer. It tracks
 * the current environment, active goals, and system resource status.
 * Updated each cognitive cycle when the STG grants authorization.
 */

export interface ASMState {
  current_environment: string;
  active_goals: string[];
  battery_status: number; // 0.0–1.0
  mode: 'idle' | 'active' | 'alert' | 'emergency';
  cycleCount: number;
  lastUpdated: number;
}

/** @deprecated Use ASMState */
export type MindState = ASMState;
/** @deprecated Use ASMState */
export type State = ASMState;

export class StateModel {
  private state: ASMState = {
    current_environment: 'unknown',
    active_goals: [],
    battery_status: 1.0,
    mode: 'idle',
    cycleCount: 0,
    lastUpdated: Date.now(),
  };

  get(): ASMState {
    return { ...this.state, active_goals: [...this.state.active_goals] };
  }

  update(partial: Partial<Omit<ASMState, 'cycleCount' | 'lastUpdated'>>): void {
    this.state = {
      ...this.state,
      ...partial,
      cycleCount: this.state.cycleCount + 1,
      lastUpdated: Date.now(),
    };
  }
}
