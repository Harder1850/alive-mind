export interface MindState {
  mode: "idle" | "active" | "alert" | "emergency";
  cycleCount: number;
  lastUpdated: number;
}

export class StateModel {
  private state: MindState = {
    mode: "idle",
    cycleCount: 0,
    lastUpdated: Date.now(),
  };

  get(): MindState {
    return { ...this.state };
  }

  update(partial: Partial<MindState>): void {
    this.state = { ...this.state, ...partial, lastUpdated: Date.now() };
  }
}
