import type { WorkingItem } from "./memory-types";

export class WorkingMemory {
  private readonly items = new Map<string, WorkingItem>();

  constructor(private readonly capacity = 64) {}

  push(item: WorkingItem): void {
    this.evictExpired();
    this.items.set(item.id, item);
    this.enforceCapacity();
  }

  get(id: string): WorkingItem | undefined {
    this.evictExpired();
    return this.items.get(id);
  }

  list(): WorkingItem[] {
    this.evictExpired();
    return [...this.items.values()].sort((a, b) => b.priority - a.priority);
  }

  refresh(id: string, expiresAt?: number): WorkingItem | undefined {
    const current = this.items.get(id);
    if (!current) return undefined;
    const next = { ...current, expiresAt };
    this.items.set(id, next);
    return next;
  }

  evict(id: string): boolean {
    return this.items.delete(id);
  }

  private evictExpired(now = Date.now()): void {
    for (const [id, item] of this.items.entries()) {
      if (typeof item.expiresAt === "number" && item.expiresAt <= now) {
        this.items.delete(id);
      }
    }
  }

  private enforceCapacity(): void {
    if (this.items.size <= this.capacity) return;
    const ranked = [...this.items.values()].sort((a, b) => a.priority - b.priority);
    const toRemove = this.items.size - this.capacity;
    for (let i = 0; i < toRemove; i += 1) {
      const item = ranked[i];
      if (item) this.items.delete(item.id);
    }
  }
}
