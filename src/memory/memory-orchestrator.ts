import { chooseEncodingTarget, type IncomingObservation } from "./encoding-engine";
import type { WorkingItem } from "./memory-types";
import { OutcomeBuffer } from "./outcome-buffer";
import { recallTop, type RecallContext, type RecallResult } from "./recall-engine";
import { ReferenceStore } from "./reference-store";
import { ThreadStore } from "./thread-store";
import { WorkingMemory } from "./working-memory";
import type {
  ContradictionRecord,
  EpisodeRecord,
  OutcomeRecord,
  ProcedureRecord,
  SemanticRecord,
} from "./types";
import { guardMemoryWrite } from "../lockdown/memory-write-guard";

export class MemoryOrchestrator {
  readonly references: ReferenceStore;
  readonly threads = new ThreadStore();
  readonly outcomes = new OutcomeBuffer();

  // Working memory is injected when sharing an instance with an external caller
  // (e.g. Phase1Memory.working in the cognition loop). Falls back to an owned instance
  // when the orchestrator is used standalone so it remains independently usable.
  private readonly working: WorkingMemory;

  private readonly episodes: EpisodeRecord[] = [];
  private readonly semantics: SemanticRecord[] = [];
  private readonly procedures: ProcedureRecord[] = [];
  private readonly contradictions: ContradictionRecord[] = [];

  constructor(sharedWorking?: WorkingMemory, sharedReferences?: ReferenceStore) {
    this.working = sharedWorking ?? new WorkingMemory(64);
    this.references = sharedReferences ?? new ReferenceStore();
  }

  encode(observation: IncomingObservation): ReturnType<typeof chooseEncodingTarget> {
    const decision = chooseEncodingTarget(observation);

    // Passive mode guard — analysis (chooseEncodingTarget) is always allowed;
    // only the actual memory mutations are suppressed.
    if (guardMemoryWrite('MemoryOrchestrator.encode')) {
      if (decision.target === "reference") {
        this.references.upsert(decision.record);
      } else if (decision.target === "thread") {
        this.threads.upsert(decision.record);
      } else if (decision.target === "working") {
        this.working.push({
          id: decision.record.id,
          kind: "working_record",
          value: observation.text,
          priority: Math.max(0.1, Math.min(1, decision.record.confidence)),
          expiresAt: observation.timestamp + 5 * 60_000,
        });
      } else if (decision.target === "episode") {
        this.episodes.unshift(decision.record);
        this.episodes.splice(256);
      }
    }

    return decision;
  }

  appendOutcome(record: OutcomeRecord): void {
    if (!guardMemoryWrite('MemoryOrchestrator.appendOutcome')) return;
    this.outcomes.append(record);
  }

  writeWorking(item: WorkingItem): void {
    if (!guardMemoryWrite('MemoryOrchestrator.writeWorking')) return;
    this.working.push(item);
  }

  listWorking(): WorkingItem[] {
    return this.working.list();
  }

  getWorking(id: string): WorkingItem | undefined {
    return this.working.get(id);
  }

  upsertProcedure(record: ProcedureRecord): void {
    if (!guardMemoryWrite('MemoryOrchestrator.upsertProcedure')) return;
    const idx = this.procedures.findIndex((p) => p.id === record.id);
    if (idx >= 0) {
      this.procedures[idx] = { ...record, updatedAt: Date.now() };
      return;
    }
    this.procedures.unshift(record);
    this.procedures.splice(256);
  }

  upsertSemantic(record: SemanticRecord): void {
    if (!guardMemoryWrite('MemoryOrchestrator.upsertSemantic')) return;
    const idx = this.semantics.findIndex((s) => s.id === record.id);
    if (idx >= 0) {
      this.semantics[idx] = { ...record, updatedAt: Date.now() };
      return;
    }
    this.semantics.unshift(record);
    this.semantics.splice(256);
  }

  upsertContradiction(record: ContradictionRecord): void {
    if (!guardMemoryWrite('MemoryOrchestrator.upsertContradiction')) return;
    const idx = this.contradictions.findIndex((c) => c.id === record.id);
    if (idx >= 0) {
      this.contradictions[idx] = { ...record, updatedAt: Date.now() };
      return;
    }
    this.contradictions.unshift(record);
    this.contradictions.splice(256);
  }

  recall(ctx: RecallContext): RecallResult {
    return recallTop(ctx, {
      working:        this.working.list(),
      references:     this.references.list(),
      procedures:     this.procedures,
      episodes:       this.episodes,
      semantics:      this.semantics,
      threads:        this.threads.list(),
      contradictions: this.contradictions,
    });
  }
}
