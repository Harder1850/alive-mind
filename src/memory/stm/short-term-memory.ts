import type { Signal } from '../../../../alive-constitution/contracts/signal';

const MAX_SIZE = 50;

/**
 * Short-term working memory.
 * Holds the last MAX_SIZE signals as a ring buffer.
 * Used by the reasoning engine for recency-based pattern matching.
 */
export class ShortTermMemory {
  private entries: Signal[] = [];

  push(signal: Signal): void {
    this.entries.push(signal);
    if (this.entries.length > MAX_SIZE) {
      this.entries.shift();
    }
  }

  getAll(): Signal[] {
    return [...this.entries];
  }

  /** Returns the N most recent signals. */
  recent(n: number): Signal[] {
    return this.entries.slice(-n);
  }

  /** Returns signals whose raw_content matches the given pattern (case-insensitive). */
  search(pattern: string): Signal[] {
    const lower = pattern.toLowerCase();
    return this.entries.filter((s) =>
      String(s.raw_content ?? '').toLowerCase().includes(lower),
    );
  }

  size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

/** Module-level singleton — shared across all reasoning-engine calls in this process. */
export const stm = new ShortTermMemory();
