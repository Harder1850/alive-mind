/** Stub: Short-term working memory. */
export class ShortTermMemory {
  private entries: unknown[] = [];

  push(entry: unknown): void {
    this.entries.push(entry);
  }

  getAll(): unknown[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
