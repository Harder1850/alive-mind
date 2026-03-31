import { AssociativeGraph } from "./associative-graph";
import { EpisodicMemory } from "./episodic-memory";
import type { AssocEdge, MemoryEvent } from "./memory-types";
import { ReferenceMemory } from "./reference-memory";
import { StructuralMemory } from "./structural-memory";
import { WorkingMemory } from "./working-memory";

export interface MemoryStores {
  working: WorkingMemory;
  episodic: EpisodicMemory;
  structural: StructuralMemory;
  reference: ReferenceMemory;
  graph: AssociativeGraph;
}

export class MemoryEncoder {
  constructor(private readonly stores: MemoryStores) {}

  encode(event: MemoryEvent): void {
    const now = event.time ?? Date.now();
    const salience = event.salience ?? 0.5;

    // 1) Working memory for immediately relevant cues
    if (salience >= 0.35) {
      this.stores.working.push({
        id: event.id,
        kind: "event",
        value: event.cue,
        priority: Math.max(0.1, Math.min(1, salience)),
        expiresAt: now + 5 * 60_000,
      });
    }

    // 2) Episodic memory for scene/outcome/salient events
    if (salience >= 0.5 || event.context?.length || event.entities?.length) {
      this.stores.episodic.append({
        id: event.id,
        entities: event.entities ?? [],
        context: event.context ?? [],
        time: now,
        outcome: undefined,
        salience,
        confidence: event.confidence ?? 0.6,
        uncertainty: event.uncertainty ?? 0.4,
      });
    }

    // 3) Structural memory from inferred traits/patterns
    for (const trait of event.traits ?? []) {
      this.stores.structural.upsert({ id: trait.id, type: trait.type, traits: trait.traits });
    }

    // 4) Reference memory for exact facts
    for (const fact of event.exactFacts ?? []) {
      this.stores.reference.upsert({
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence ?? event.confidence ?? 0.7,
      });
    }

    // 5) Associations: connect event + anchors to top 3-5 obvious links
    this.linkAssociations(event);
  }

  encodeOutcome(eventId: string, outcome: string, confidence = 0.7): void {
    this.stores.working.push({
      id: `outcome:${eventId}`,
      kind: "outcome",
      value: outcome,
      priority: confidence,
      expiresAt: Date.now() + 10 * 60_000,
    });
  }

  private linkAssociations(event: MemoryEvent): void {
    const anchors = new Set<string>();
    anchors.add(event.id);
    for (const entity of event.entities ?? []) anchors.add(entity);
    for (const c of event.context ?? []) anchors.add(`ctx:${c.toLowerCase()}`);
    for (const t of event.traits ?? []) anchors.add(t.id);
    for (const f of event.exactFacts ?? []) anchors.add(`ref:${f.key.toLowerCase()}`);

    const list = [...anchors].slice(0, 6);
    const edges: AssocEdge[] = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        edges.push({
          from: list[i]!,
          to: list[j]!,
          type: "co_observed",
          weight: Math.max(0.2, 1 - j * 0.1),
        });
      }
    }
    edges.slice(0, 5).forEach((e) => this.stores.graph.addOrUpdate(e));
  }
}
