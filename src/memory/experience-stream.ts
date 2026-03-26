/**
 * Experience Stream — alive-mind's immutable append-only event log.
 *
 * Every signal processed and action taken is recorded here. The stream
 * is never modified — only appended to. This provides:
 *   - Audit trail for all cognitive decisions
 *   - Training data for future learning cycles
 *   - Post-hoc analysis of behavior patterns
 *
 * Storage: alive-mind/memory/experience-stream.jsonl (newline-delimited JSON)
 * The JSONL format allows streaming reads without loading the full file.
 *
 * Max size: 10,000 entries (oldest pruned when exceeded).
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Action } from '../../../alive-constitution/contracts/action';

export interface ExperienceEntry {
  /** Monotonically increasing sequence number */
  seq: number;
  epoch: number;
  signal_id: string;
  signal_source: string;
  signal_preview: string;  // first 100 chars of raw_content
  action_type: string;
  action_preview: string;  // first 100 chars of action output
  was_reflex: boolean;
  stg_result: 'OPEN' | 'DEFER' | 'DENY' | 'REFLEX';
  flags_raised: number;
  threat_flag: boolean;
}

const STREAM_DIR  = join(__dirname, '..', '..', 'memory');
const STREAM_PATH = join(STREAM_DIR, 'experience-stream.jsonl');
const MAX_ENTRIES = 10_000;

let seqCounter = 0;

function initSeqFromDisk(): void {
  if (!existsSync(STREAM_PATH)) return;
  try {
    const lines = readFileSync(STREAM_PATH, 'utf-8').trim().split('\n');
    const last = lines[lines.length - 1];
    if (last) {
      const entry = JSON.parse(last) as ExperienceEntry;
      seqCounter = entry.seq;
    }
  } catch {
    // non-fatal — start from 0
  }
}

// Initialize seq on module load
initSeqFromDisk();

function pruneIfNeeded(): void {
  if (!existsSync(STREAM_PATH)) return;
  try {
    const lines = readFileSync(STREAM_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    if (lines.length > MAX_ENTRIES) {
      const pruned = lines.slice(lines.length - MAX_ENTRIES);
      writeFileSync(STREAM_PATH, pruned.join('\n') + '\n', 'utf-8');
    }
  } catch {
    // non-fatal
  }
}

export function appendExperience(
  signal: Signal,
  action: Action,
  opts: {
    stg_result: ExperienceEntry['stg_result'];
    was_reflex: boolean;
    flags_raised: number;
  },
): void {
  seqCounter++;

  const actionPreview =
    action.type === 'display_text'
      ? action.payload.slice(0, 100)
      : `write_file:${action.filename}`;

  const entry: ExperienceEntry = {
    seq: seqCounter,
    epoch: Date.now(),
    signal_id: signal.id,
    signal_source: signal.source,
    signal_preview: String(signal.raw_content ?? '').slice(0, 100),
    action_type: action.type,
    action_preview: actionPreview,
    was_reflex: opts.was_reflex,
    stg_result: opts.stg_result,
    flags_raised: opts.flags_raised,
    threat_flag: signal.threat_flag,
  };

  try {
    mkdirSync(STREAM_DIR, { recursive: true });
    appendFileSync(STREAM_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[ExperienceStream] Failed to append entry:', err);
  }

  // Prune every 1000 entries to avoid unbounded file growth
  if (seqCounter % 1000 === 0) pruneIfNeeded();
}

/** Read the most recent N entries from the stream. */
export function recentExperiences(n: number): ExperienceEntry[] {
  if (!existsSync(STREAM_PATH)) return [];
  try {
    const lines = readFileSync(STREAM_PATH, 'utf-8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-n)
      .map((l) => JSON.parse(l) as ExperienceEntry);
  } catch {
    return [];
  }
}
