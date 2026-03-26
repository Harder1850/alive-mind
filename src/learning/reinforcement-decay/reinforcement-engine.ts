import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Story } from '../../memory/derived-memory';

const STORIES_PATH = join(__dirname, '../../../memory/stories.json');
const TRUST_FLOOR = 0.1;
const TRUST_CEILING = 1.0;
const DECAY_RATE = 0.02;

function loadStories(): Story[] {
  try {
    return JSON.parse(readFileSync(STORIES_PATH, 'utf-8')) as Story[];
  } catch {
    return [];
  }
}

function saveStories(stories: Story[]): void {
  try {
    writeFileSync(STORIES_PATH, JSON.stringify(stories, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ReinforcementEngine] Failed to save stories:', err);
  }
}

/**
 * Reinforcement and memory decay engine.
 * Adjusts story trust scores in stories.json based on outcome feedback.
 * reinforce() is called when a story's action produced a good outcome.
 * decay()     is called on idle stories to reduce confidence over time.
 */
export class ReinforcementEngine {
  /**
   * Reinforce a story by id. delta > 0 increases trust, delta < 0 decreases it.
   * Clamps result to [TRUST_FLOOR, TRUST_CEILING].
   */
  reinforce(id: string, delta: number): void {
    const stories = loadStories();
    const story = stories.find((s) => s.id === id);
    if (!story) {
      console.warn(`[ReinforcementEngine] Story not found for reinforce: ${id}`);
      return;
    }
    story.trust = Math.min(TRUST_CEILING, Math.max(TRUST_FLOOR, story.trust + delta));
    saveStories(stories);
    console.log(`[ReinforcementEngine] Reinforced ${id}: trust → ${story.trust.toFixed(3)}`);
  }

  /**
   * Decay a story's trust by DECAY_RATE.
   * Called for stories that were matched but not selected (outcompeted).
   */
  decay(id: string): void {
    this.reinforce(id, -DECAY_RATE);
  }

  /**
   * Decay all stories not in the keepIds set.
   * Call after a reasoning cycle to age out unused stories.
   */
  decayAll(keepIds: Set<string>): void {
    const stories = loadStories();
    let changed = false;
    for (const story of stories) {
      if (!keepIds.has(story.id)) {
        story.trust = Math.max(TRUST_FLOOR, story.trust - DECAY_RATE);
        changed = true;
      }
    }
    if (changed) saveStories(stories);
  }
}

export const reinforcement = new ReinforcementEngine();
