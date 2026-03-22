/** Stub: Long-term durable memory. Written via LTG only. */
export class LongTermMemory {
  private store: Map<string, unknown> = new Map();

  write(id: string, entry: unknown): void {
    this.store.set(id, entry);
  }

  read(id: string): unknown {
    return this.store.get(id);
  }
}
