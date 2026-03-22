import { StateModel } from "./state-model";
import { ConsciousBuffer } from "./conscious-buffer";

/**
 * MindLoop — Core cognitive cycle.
 * Runs: perceive → process → decide → (output Decision contract only)
 *
 * DOES NOT execute actions. Outputs Decision contracts to Runtime.
 */
export class MindLoop {
  private running = false;
  private stateModel = new StateModel();
  private buffer = new ConsciousBuffer();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      await this.cycle();
      await this.sleep(100);
    }
  }

  private async cycle(): Promise<void> {
    const state = this.stateModel.get();
    this.stateModel.update({ cycleCount: state.cycleCount + 1 });
    // TODO: UC → STM → Decisions pipeline
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
