/** Transient buffer for active thoughts before STM consolidation. */
export class ConsciousBuffer {
  private buffer: unknown[] = [];
  private readonly maxSize = 20;

  push(thought: unknown): void {
    if (this.buffer.length >= this.maxSize) this.buffer.shift();
    this.buffer.push(thought);
  }

  flush(): unknown[] {
    const items = [...this.buffer];
    this.buffer = [];
    return items;
  }
}
