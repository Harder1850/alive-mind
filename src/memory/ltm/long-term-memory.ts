/**
 * Long-Term Memory (LTM) — alive-mind's persistent durable store.
 *
 * Entries are written ONLY via the Learning Transfer Gate (LTG), which
 * gates on trust × MVI thresholds. Arbitrary writes are blocked to
 * preserve memory integrity.
 *
 * Storage: alive-mind/memory/ltm.json (human-readable for debugging)
 * Index: in-memory Map keyed by entry ID, rebuilt from file on boot.
 *
 * MVI = Mission Value Index (0–100). Higher MVI entries are returned first
 * when querying for relevant memories.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface LTMEntry {
  id: string;
  type: 'story' | 'fact' | 'pattern' | 'lesson';
  content: string;
  mvi: number;       // Mission Value Index 0–100
  trust: number;     // 0.0–1.0
  created_at: number;
  updated_at: number;
  access_count: number;
}

const LTM_DIR  = join(__dirname, '..', '..', '..', 'memory');
const LTM_PATH = join(LTM_DIR, 'ltm.json');

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadFromDisk(): Map<string, LTMEntry> {
  const store = new Map<string, LTMEntry>();
  if (!existsSync(LTM_PATH)) return store;
  try {
    const entries = JSON.parse(readFileSync(LTM_PATH, 'utf-8')) as LTMEntry[];
    for (const e of entries) store.set(e.id, e);
    console.log(`[LTM] Loaded ${store.size} entries from disk.`);
  } catch {
    console.warn('[LTM] Failed to parse ltm.json — starting empty.');
  }
  return store;
}

function saveToDisk(store: Map<string, LTMEntry>): void {
  try {
    mkdirSync(LTM_DIR, { recursive: true });
    const entries = [...store.values()].sort((a, b) => b.mvi - a.mvi);
    writeFileSync(LTM_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LTM] Failed to persist ltm.json:', err);
  }
}

// ---------------------------------------------------------------------------
// LongTermMemory class
// ---------------------------------------------------------------------------

export class LongTermMemory {
  private store: Map<string, LTMEntry> = loadFromDisk();

  /** Write a new entry or update an existing one. Called by LTG only. */
  write(entry: LTMEntry): void {
    const existing = this.store.get(entry.id);
    if (existing) {
      // Merge — preserve access history, bump trust toward new value
      const merged: LTMEntry = {
        ...entry,
        access_count: existing.access_count,
        trust: (existing.trust * 0.7 + entry.trust * 0.3),
        updated_at: Date.now(),
      };
      this.store.set(entry.id, merged);
    } else {
      this.store.set(entry.id, { ...entry, access_count: 0 });
    }
    saveToDisk(this.store);
  }

  /** Read a single entry by ID. Increments access count. */
  read(id: string): LTMEntry | undefined {
    const entry = this.store.get(id);
    if (entry) {
      entry.access_count++;
      entry.updated_at = Date.now();
    }
    return entry;
  }

  /** Search entries by content substring, sorted by MVI descending. */
  search(query: string, limit = 5): LTMEntry[] {
    const lower = query.toLowerCase();
    return [...this.store.values()]
      .filter((e) => e.content.toLowerCase().includes(lower))
      .sort((a, b) => b.mvi - a.mvi || b.trust - a.trust)
      .slice(0, limit);
  }

  /** Return top N entries by MVI. */
  topByMVI(n = 10): LTMEntry[] {
    return [...this.store.values()]
      .sort((a, b) => b.mvi - a.mvi)
      .slice(0, n);
  }

  size(): number {
    return this.store.size;
  }
}

export const ltm = new LongTermMemory();
