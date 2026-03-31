/**
 * ReferenceAdapter
 *
 * Bridges Phase1Memory's ReferenceMemory interface (RefItem) with the richer
 * ReferenceStore (ReferenceRecord) so both share a single backing map.
 *
 * Why extend rather than implement:
 *   TypeScript includes private fields in class structural compatibility checks.
 *   Phase1Memory.reference is typed as `ReferenceMemory`, so any assignee must be a
 *   structural subtype — which a plain object cannot satisfy.  Extending the class
 *   guarantees subtype-compatibility while letting us override every method to delegate
 *   all reads/writes to the injected ReferenceStore.  The inherited private `byKey` map
 *   is never populated; it remains an empty dead Map.
 */

import type { RefItem } from "./memory-types";
import { ReferenceMemory } from "./reference-memory";
import { ReferenceStore } from "./reference-store";

export class ReferenceAdapter extends ReferenceMemory {
  constructor(private readonly store: ReferenceStore) {
    super();
  }

  override upsert(item: RefItem): void {
    const existing = this.store.get(item.key);
    const now = Date.now();
    this.store.upsert({
      id: item.key.toLowerCase(),
      kind: "reference",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      confidence: item.confidence,
      trust: item.confidence, // best proxy available at Phase 1
      tags: existing?.tags ?? [],
      sourceRefs: existing?.sourceRefs ?? [],
      key: item.key,
      value: item.value,
    });
  }

  override get(key: string): RefItem | undefined {
    const rec = this.store.get(key);
    if (!rec) return undefined;
    return { key: rec.key, value: rec.value, confidence: rec.confidence };
  }

  override listHot(limit = 20): RefItem[] {
    return this.store
      .list()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
      .map((r) => ({ key: r.key, value: r.value, confidence: r.confidence }));
  }

  override listAll(): RefItem[] {
    return this.store
      .list()
      .map((r) => ({ key: r.key, value: r.value, confidence: r.confidence }));
  }
}
