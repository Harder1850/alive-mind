import { AssociativeGraph } from "./associative-graph";
import { EpisodicMemory } from "./episodic-memory";
import type { RecallCandidate, RecallRequest } from "./memory-types";
import { ReferenceMemory } from "./reference-memory";
import { StructuralMemory } from "./structural-memory";
import { WorkingMemory } from "./working-memory";

export interface RecallStores {
  working: WorkingMemory;
  episodic: EpisodicMemory;
  structural: StructuralMemory;
  reference: ReferenceMemory;
  graph: AssociativeGraph;
}

function includesFragment(hay: string, cue: string): boolean {
  const h = hay.toLowerCase();
  const c = cue.toLowerCase().trim();
  if (!c) return false;
  if (h.includes(c)) return true;
  if (c.length >= 2 && h.includes(c.slice(0, 2))) return true;
  return c.split(/\s+/).some((part) => part.length > 1 && h.includes(part));
}

export class MemoryRecall {
  constructor(private readonly stores: RecallStores) {}

  recall(req: RecallRequest): RecallCandidate[] {
    const candidates: RecallCandidate[] = [];
    const precision = req.precisionNeed ?? "medium";

    for (const item of this.stores.working.list()) {
      const text = `${item.kind} ${String(item.value)}`;
      if (!includesFragment(text, req.cue)) continue;
      candidates.push({
        id: `working:${item.id}`,
        source: "working",
        confidence: Math.min(1, item.priority + 0.1),
        summary: `working/${item.kind}`,
        payload: item,
      });
    }

    const episodeHits = this.stores.episodic.query({
      contextFragment: req.context?.[0] ?? req.cue,
    });
    for (const episode of episodeHits.slice(0, 8)) {
      candidates.push({
        id: `episode:${episode.id}`,
        source: "episodic",
        confidence: Math.min(1, episode.salience * 0.6 + episode.confidence * 0.4),
        summary: `episode/${episode.context.slice(0, 2).join(",")}`,
        payload: episode,
      });
    }

    const structural = [
      ...this.stores.structural.queryByType(req.cue),
      ...this.stores.structural.queryByTrait(req.cue),
      ...(req.context?.flatMap((c) => this.stores.structural.queryByTrait(c)) ?? []),
    ];
    const seenStructural = new Set<string>();
    for (const node of structural) {
      if (seenStructural.has(node.id)) continue;
      seenStructural.add(node.id);
      candidates.push({
        id: `struct:${node.id}`,
        source: "structural",
        confidence: 0.62,
        summary: `struct/${node.type}`,
        payload: node,
      });
    }

    if (precision === "high") {
      const exact = this.stores.reference.get(req.cue);
      if (exact) {
        candidates.push({
          id: `ref:${exact.key}`,
          source: "reference",
          confidence: Math.min(1, exact.confidence + 0.1),
          summary: `reference/${exact.key}`,
          payload: exact,
        });
      }
      for (const ref of this.stores.reference.listAll()) {
        if (ref.key === exact?.key) continue;
        if (!includesFragment(ref.key, req.cue)) continue;
        candidates.push({
          id: `ref:${ref.key}`,
          source: "reference",
          confidence: ref.confidence,
          summary: `reference/${ref.key}`,
          payload: ref,
        });
      }
    }

    const anchorIds = candidates.slice(0, 5).map((c) => c.id.split(":")[1] ?? c.id);
    for (const edge of this.stores.graph.expandTop(anchorIds, 6)) {
      candidates.push({
        id: `assoc:${edge.from}->${edge.to}`,
        source: "associative",
        confidence: Math.max(0.2, Math.min(1, edge.weight)),
        summary: `assoc/${edge.type}`,
        payload: edge,
      });
    }

    return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, 20);
  }
}
