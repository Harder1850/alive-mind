/**
 * Derived Memory — Analogical story store for alive-mind.
 *
 * Stories are "If-This-Then-That" templates that let ALIVE improvise when
 * facing novel signals. Pattern-matches known scenarios and adapts response
 * rather than freezing on incomplete information.
 *
 * Loads from memory/stories.json (populated by seed scripts) at module init,
 * falling back to built-in seed stories when the file is absent.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import type { Signal } from '../../../alive-constitution/contracts';
import type { Action } from '../../../alive-constitution/contracts/action';
import type { ASMState } from '../spine/state-model';

export interface Story {
  id: string;
  context: string;
  trigger_pattern: string;
  action_plan: {
    target_actuator: string;
    command_payload: Record<string, unknown>;
  };
  outcome: string;
  mvi: number;    // Mission Value Index 0–100 (higher = more critical)
  trust: number;  // 0.0–1.0
}

// ---------------------------------------------------------------------------
// Built-in seed stories (fallback when stories.json is absent)
// ---------------------------------------------------------------------------
const SEED_STORIES: readonly Story[] = [
  {
    id: 'story-seed-01',
    context: 'Operator greeting',
    trigger_pattern: 'hello',
    action_plan: { target_actuator: 'system_api', command_payload: { action: 'greet' } },
    outcome: 'Hello from local memory pattern.',
    mvi: 10,
    trust: 0.9,
  },
  {
    id: 'story-seed-02',
    context: 'Status inquiry',
    trigger_pattern: 'status',
    action_plan: { target_actuator: 'system_api', command_payload: { action: 'report_status' } },
    outcome: 'Local state is active and stable.',
    mvi: 20,
    trust: 0.85,
  },
  {
    id: 'story-seed-03',
    context: 'Error signal received',
    trigger_pattern: 'error',
    action_plan: { target_actuator: 'system_api', command_payload: { action: 'request_clarification' } },
    outcome: 'Acknowledged error. Requesting clarification.',
    mvi: 50,
    trust: 0.8,
  },
  {
    id: 'story-seed-04',
    context: 'Universal fallback for unknown signals',
    trigger_pattern: '\x00', // never matches real content — pure fallback
    action_plan: { target_actuator: 'system_api', command_payload: { action: 'acknowledge_unknown' } },
    outcome: 'Signal received but no pattern matched. Requesting more context.',
    mvi: 5,
    trust: 0.5,
  },
];

// ---------------------------------------------------------------------------
// Load from JSON file if available (written by seed-sun-tzu.ts or similar)
// ---------------------------------------------------------------------------
function loadStories(): readonly Story[] {
  // __dirname is alive-mind/src/memory/ when running via tsx
  const jsonPath = join(__dirname, '..', '..', 'memory', 'stories.json');
  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, 'utf-8');
      return JSON.parse(raw) as Story[];
    } catch {
      // Fall through to seed stories on parse error
    }
  }
  return SEED_STORIES;
}

const STORY_STORE: readonly Story[] = loadStories();

// ---------------------------------------------------------------------------
// Dedicated no-match fallback — always low trust so reasoning-engine escalates
// ---------------------------------------------------------------------------
const NO_MATCH_FALLBACK: Story = {
  id: 'story-no-match',
  context: 'No pattern matched — signal is genuinely novel',
  trigger_pattern: '\x00',
  action_plan: { target_actuator: 'system_api', command_payload: { action: 'escalate_to_teacher' } },
  outcome: 'No local match. Escalating to LLM Teacher.',
  mvi: 0,
  trust: 0.0,
};

// ---------------------------------------------------------------------------
// Retrieval — Story-based interface
// ---------------------------------------------------------------------------

/**
 * Find the highest-MVI story whose trigger_pattern appears in the signal's
 * raw_content. Returns a zero-trust fallback when nothing matches, so the
 * reasoning engine escalates to the LLM Teacher rather than recycling an
 * unrelated high-trust story (e.g. Sun Tzu seeded at trust 1.0).
 */
export function findMatchingStory(signal: Signal): Story {
  const content = String(signal.raw_content ?? '').toLowerCase();

  const matches = STORY_STORE.filter(
    (s) => s.trigger_pattern !== '\x00' && content.includes(s.trigger_pattern.toLowerCase()),
  );

  if (matches.length === 0) {
    return NO_MATCH_FALLBACK;
  }

  // Return highest-MVI match (most mission-critical applicable story)
  return matches.sort((a, b) => b.mvi - a.mvi)[0]!;
}

// ---------------------------------------------------------------------------
// Backward-compatible Action-returning interface (used by reasoning-engine.ts)
// ---------------------------------------------------------------------------

/**
 * Returns a strong local Action when a high-trust story matches.
 * Returns null when the signal is novel enough to warrant Teacher consultation.
 */
export function findStrongLocalMatch(signal: Signal, _state: ASMState): Action | null {
  const story = findMatchingStory(signal);

  // Novel threshold: trust below 0.7 means we don't have a confident local answer
  if (story.trust < 0.7) return null;

  return {
    type: 'display_text',
    payload: story.outcome,
  };
}
