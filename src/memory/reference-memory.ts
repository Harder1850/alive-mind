import type { RefItem } from "./memory-types";

export class ReferenceMemory {
  private readonly byKey = new Map<string, RefItem>();

  upsert(item: RefItem): void {
    this.byKey.set(item.key.toLowerCase(), item);
  }

  get(key: string): RefItem | undefined {
    return this.byKey.get(key.toLowerCase());
  }

  listHot(limit = 20): RefItem[] {
    return [...this.byKey.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  listAll(): RefItem[] {
    return [...this.byKey.values()];
  }
}
