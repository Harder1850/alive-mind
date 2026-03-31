import type { StructNode } from "./memory-types";

export class StructuralMemory {
  private readonly nodes = new Map<string, StructNode>();

  upsert(node: StructNode): void {
    this.nodes.set(node.id, node);
  }

  get(id: string): StructNode | undefined {
    return this.nodes.get(id);
  }

  queryByType(type: string): StructNode[] {
    return [...this.nodes.values()].filter((n) => n.type === type);
  }

  queryByTrait(fragment: string): StructNode[] {
    const f = fragment.toLowerCase();
    return [...this.nodes.values()].filter((n) => {
      const text = JSON.stringify(n.traits).toLowerCase();
      return text.includes(f);
    });
  }

  list(limit = 50): StructNode[] {
    return [...this.nodes.values()].slice(0, limit);
  }
}
