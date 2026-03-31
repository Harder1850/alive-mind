import type { OutcomeRecord } from "./types";

export class OutcomeBuffer {
  private readonly capacity: number;
  private records: OutcomeRecord[] = [];

  constructor(capacity = 256) {
    this.capacity = capacity;
  }

  append(record: OutcomeRecord): void {
    this.records.push(record);
    if (this.records.length > this.capacity) {
      this.records = this.records.slice(this.records.length - this.capacity);
    }
  }

  list(): OutcomeRecord[] {
    return [...this.records];
  }

  consume(predicate: (r: OutcomeRecord) => boolean): OutcomeRecord[] {
    const matched = this.records.filter(predicate);
    this.records = this.records.filter((r) => !predicate(r));
    return matched;
  }
}
