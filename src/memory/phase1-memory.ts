import { AssociativeGraph } from "./associative-graph";
import { EpisodicMemory } from "./episodic-memory";
import { MemoryEncoder } from "./memory-encoder";
import { MemoryRecall } from "./memory-recall";
import type { MemoryEvent, RecallRequest } from "./memory-types";
import { ReferenceAdapter } from "./reference-adapter";
import { ReferenceStore } from "./reference-store";
import { StructuralMemory } from "./structural-memory";
import { WorkingMemory } from "./working-memory";
import { guardMemoryWrite } from "../lockdown/memory-write-guard";

export class Phase1Memory {
  readonly working = new WorkingMemory(80);
  readonly episodic = new EpisodicMemory();
  readonly structural = new StructuralMemory();
  // referenceStore is the authoritative backing store shared with MemoryOrchestrator.
  // reference is the ReferenceMemory-compatible view used by MemoryEncoder / MemoryRecall.
  readonly referenceStore = new ReferenceStore();
  readonly reference = new ReferenceAdapter(this.referenceStore);
  readonly graph = new AssociativeGraph();

  private readonly encoder = new MemoryEncoder({
    working: this.working,
    episodic: this.episodic,
    structural: this.structural,
    reference: this.reference,
    graph: this.graph,
  });

  private readonly recallEngine = new MemoryRecall({
    working: this.working,
    episodic: this.episodic,
    structural: this.structural,
    reference: this.reference,
    graph: this.graph,
  });

  encode(event: MemoryEvent): void {
    if (!guardMemoryWrite('Phase1Memory.encode')) return;
    this.encoder.encode(event);
  }

  encodeOutcome(eventId: string, outcome: string, confidence?: number): void {
    if (!guardMemoryWrite('Phase1Memory.encodeOutcome')) return;
    this.encoder.encodeOutcome(eventId, outcome, confidence);
  }

  recall(req: RecallRequest) {
    return this.recallEngine.recall(req);
  }

  snapshot() {
    return {
      working: this.working.list().slice(0, 10),
      episodes: this.episodic.list(10),
      structuralNodes: this.structural.list(20),
      referenceHot: this.reference.listHot(20),
      associations: this.graph.listRecent(20),
    };
  }
}
