import type { AssocEdge, ID } from "./memory-types";

export class AssociativeGraph {
  private readonly edges = new Map<string, AssocEdge>();

  private key(from: ID, to: ID, type: string): string {
    return `${from}::${to}::${type}`;
  }

  addOrUpdate(edge: AssocEdge): void {
    this.edges.set(this.key(edge.from, edge.to, edge.type), edge);
  }

  neighbors(nodeId: ID): AssocEdge[] {
    return [...this.edges.values()].filter((e) => e.from === nodeId || e.to === nodeId);
  }

  expandTop(nodeIds: ID[], limit = 5): AssocEdge[] {
    const set = new Set(nodeIds);
    return [...this.edges.values()]
      .filter((e) => set.has(e.from) || set.has(e.to))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  listRecent(limit = 20): AssocEdge[] {
    return [...this.edges.values()].sort((a, b) => b.weight - a.weight).slice(0, limit);
  }
}
