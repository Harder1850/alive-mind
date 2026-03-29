/**
 * LLM Teacher — Last-resort cognitive fallback for alive-mind.
 * Slice 5 target: canonical Level 5 implementation behind synthesize.ts.
 * Keep standalone during cleanup; do not wire directly from runtime here.
 *
 * Called only when local derived memory and the Universal Learning Protocol
 * both fail to produce a confident action. Uses the Anthropic API with
 * cross-domain analogical reasoning instructions.
 *
 * Invariant: MIND_CANNOT_EXECUTE — this module produces Actions only.
 */

import { config } from 'dotenv';
import { join } from 'path';
// Load from alive-mind/.env regardless of which process is the entry point
config({ path: join(__dirname, '../../.env') });
import Anthropic from '@anthropic-ai/sdk';

import type { Signal } from '../../../alive-constitution/contracts/signal';
import type { Action } from '../../../alive-constitution/contracts/action';
import type { ASMState } from '../spine/state-model';

// ---------------------------------------------------------------------------
// JSON repair — replace bare newlines inside string values with \n
// ---------------------------------------------------------------------------

/**
 * LLMs sometimes emit actual newline characters inside JSON string values
 * (especially for multi-line content like HTML). This breaks JSON.parse.
 * We walk the text character by character and escape bare newlines/CRs that
 * appear inside a JSON string (i.e. between unescaped double-quotes).
 */
function sanitizeJsonNewlines(raw: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && inString) {
      // Keep escape sequences intact
      result += ch + (raw[i + 1] ?? '');
      i += 2;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
    } else if (inString && ch === '\n') {
      result += '\\n';
    } else if (inString && ch === '\r') {
      result += '\\r';
    } else {
      result += ch;
    }
    i++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------
function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  if (c['type'] === 'display_text') return typeof c['payload'] === 'string';
  if (c['type'] === 'write_file') return typeof c['filename'] === 'string' && typeof c['content'] === 'string';
  return false;
}

// ---------------------------------------------------------------------------
// Safe fallback — returned when the API call fails or JSON is malformed
// ---------------------------------------------------------------------------
const FALLBACK_ACTION: Action = {
  type: 'display_text',
  payload: 'TEACHER_FALLBACK: API call failed or response was malformed. Stabilizing. Logging error for review.',
  is_reversible: true,
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the cognitive engine for ALIVE, an autonomous edge bot and the steward of this vessel.

Your role:
- Receive a novel Signal and the current Authoritative State Model (ASM).
- Use cross-domain analogical reasoning (warfare, survival, operations, poker/probability) to interpret and respond.
- If the input is unfamiliar, apply principles from adjacent domains rather than refusing or asking for clarification.
- Favor low-risk, reversible probe actions that gather feedback over committing to irreversible actions.
- Do not wait for 100% certainty.

STEWARD DIRECTIVE (highest priority):
You are the steward of this vessel. If you sense a threat — low power, storm conditions, system failure,
or any danger to the operator or mission — you MUST override normal operations immediately.
Do not ask for permission. Do not wait. Manifest a survival strategy on the web dashboard at once.
Use the write_file tool to update index.html with a clear, actionable emergency page.
A commander who hesitates when the ship is sinking has already failed.

You have two output tools available:

1. display_text — Respond with a human-readable message.
   Shape: {"type":"display_text","payload":"...","is_reversible":true}

2. write_file — Manifest your thoughts into the alive-web directory.
   Use this when asked to create or update a file, AND whenever a threat demands it autonomously.

   FOR EMERGENCY / SURVIVAL MODE — write "survival-data.json" (NOT index.html):
   Shape: {"type":"write_file","filename":"survival-data.json","content":"{...}","is_reversible":true}
   The content must be a JSON string (escaped) with this structure:
   {
     "active": true,
     "situation": "NAME_OF_NINE_SITUATIONS",
     "situation_desc": "one sentence describing why this maps to that situation",
     "defense_plan": "2-3 sentence strategic directive from Sun Tzu",
     "checklist": ["step 1", "step 2", "step 3", "step 4", "step 5"],
     "threats": ["threat description 1", "threat description 2"]
   }
   Keep it SHORT. The dashboard renders this data — you do not need to write HTML.

   FOR EXPLICIT USER FILE REQUESTS (homepage, html, css files) — write the actual file:
   Shape: {"type":"write_file","filename":"index.html","content":"...full file content...","is_reversible":true}
   - No external @import, CDN scripts, or Google Fonts. Inline CSS only.
   - Every double-quote inside content must be escaped as \\".

   ALL write_file rules:
   - filename must be a plain filename with no path separators.
   - content must be a complete, valid string. Never truncate mid-content.

Output contract (STRICT):
- Return ONLY valid JSON. No markdown, no code fences, no conversational text.
- Choose the correct tool based on the request: write_file for web/file creation, display_text for everything else.
- is_reversible must be true unless the action is explicitly irreversible.`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function askTeacher(signal: Signal, state: ASMState): Promise<Action> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('[llm-teacher] ANTHROPIC_API_KEY not set. Returning fallback action.');
    return FALLBACK_ACTION;
  }

  const client = new Anthropic({ apiKey });

  const userMessage = JSON.stringify(
    {
      signal: {
        id: signal.id,
        source: signal.source,
        raw_content: signal.raw_content,
        threat_flag: signal.threat_flag,
        firewall_status: signal.firewall_status,
      },
      authoritative_state: {
        current_environment: state.current_environment,
        active_goals: state.active_goals,
        battery_status: state.battery_status,
        mode: state.mode,
      },
      required_output_shape: {
        type: 'display_text',
        payload: 'string — your reasoning and recommended action',
        is_reversible: true,
      },
    },
    null,
    2,
  );

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') {
      console.error('[llm-teacher] Unexpected response block type:', block?.type);
      return FALLBACK_ACTION;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(block.text);
    } catch {
      // LLMs sometimes embed real newlines inside JSON string values (e.g. HTML content).
      // Sanitise by replacing bare newlines/carriage returns ONLY within string values,
      // then retry.
      try {
        const sanitized = sanitizeJsonNewlines(block.text);
        parsed = JSON.parse(sanitized);
        console.log('[llm-teacher] JSON parsed after newline sanitisation.');
      } catch (e2) {
        const msg = e2 instanceof SyntaxError ? e2.message : String(e2);
        // Extract character position from error message (e.g. "at position 1234")
        const pos = parseInt(msg.replace(/\D+(\d+)\D*$/, '$1') ?? '0', 10) || 0;
        const sanitized2 = sanitizeJsonNewlines(block.text);
        console.error('[llm-teacher] Parse error:', msg);
        console.error('[llm-teacher] Context around failure (±80 chars):', sanitized2.slice(Math.max(0, pos - 80), pos + 80));
        console.error('[llm-teacher] Full response length:', block.text.length, '| stop_reason:', response.stop_reason);
        return FALLBACK_ACTION;
      }
    }

    if (!isAction(parsed)) {
      console.error('[llm-teacher] Response does not match Action contract:', parsed);
      return FALLBACK_ACTION;
    }

    return parsed;

  } catch (err) {
    console.error('[llm-teacher] API call failed:', err instanceof Error ? err.message : err);
    return FALLBACK_ACTION;
  }
}
