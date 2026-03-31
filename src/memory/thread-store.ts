import type { ThreadRecord } from "./types";

export class ThreadStore {
  private readonly threads = new Map<string, ThreadRecord>();

  upsert(record: ThreadRecord): void {
    this.threads.set(record.id, { ...record, updatedAt: Date.now() });
  }

  get(id: string): ThreadRecord | undefined {
    return this.threads.get(id);
  }

  list(): ThreadRecord[] {
    return [...this.threads.values()];
  }

  matchByCue(cue: string): ThreadRecord[] {
    const c = cue.toLowerCase();
    return this.list().filter((t) => {
      const hay = `${t.title} ${t.summary}`.toLowerCase();
      return hay.includes(c) || c.split(/\s+/).some((part) => part.length > 2 && hay.includes(part));
    });
  }
}
