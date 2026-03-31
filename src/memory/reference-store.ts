import type { ReferenceRecord } from "./types";

export class ReferenceStore {
  private readonly byKey = new Map<string, ReferenceRecord>();

  upsert(record: ReferenceRecord): void {
    this.byKey.set(record.key.toLowerCase(), { ...record, updatedAt: Date.now() });
  }

  get(key: string): ReferenceRecord | undefined {
    return this.byKey.get(key.toLowerCase());
  }

  list(): ReferenceRecord[] {
    return [...this.byKey.values()];
  }
}
