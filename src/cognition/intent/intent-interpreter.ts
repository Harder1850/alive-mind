/**
 * Intent Interpreter — alive-mind (public surface, invoked by alive-runtime)
 *
 * Deterministic keyword classifier. Maps plain-language user requests to
 * bounded IntentResult values from Tier 1 intent categories.
 *
 * Design rules:
 *   - No LLM. No ambiguity resolution. No probabilistic reasoning.
 *   - Unsupported or ambiguous requests are rejected with a clear reason.
 *   - Rejection patterns checked FIRST — hard blocks before soft matches.
 *   - First Tier 1 pattern match wins — no scoring or ranking.
 *   - Returns IntentResult with full traceability (request_id echoed).
 *
 * Called by alive-runtime intent-handler.ts.
 * Does not call any other alive-* layer.
 */

import type { IntentRequest, IntentResult, IntentCategory } from "../../../../alive-constitution/contracts/intent";
import type { SignalKind } from "../../../../alive-constitution/contracts";

// ── Pattern types ──────────────────────────────────────────────────────────────

interface Tier1Pattern {
  /** Keywords to match against normalized input (lowercase, punctuation stripped). */
  keywords: string[];
  category: IntentCategory;
  /** Canonical short form of this intent — used in IntentResult and Story Mode. */
  normalized_intent: string;
  /** Which SignalKind the runtime should synthesize to route this through cognition. */
  signal_kind: SignalKind;
  /** Optional parameters to extract (static, not parsed from text). */
  parameters?: Record<string, string>;
}

interface RejectionPattern {
  keywords: string[];
  reason: string;
}

// ── Tier 1 patterns ────────────────────────────────────────────────────────────
// Checked in order after rejection patterns. First match wins.
// Categories: observe → inspect → safe_action → guided_action

const TIER1_PATTERNS: Tier1Pattern[] = [

  // ── Observe ────────────────────────────────────────────────────────────────
  {
    keywords: ["what changed", "what's changed", "whats changed", "what has changed"],
    category: "observe",
    normalized_intent: "observe recent changes",
    signal_kind: "file_change_event",
  },
  {
    keywords: ["what broke", "what's broken", "whats broken", "what failed", "what errored"],
    category: "observe",
    normalized_intent: "observe recent failures",
    signal_kind: "process_error",
  },
  {
    keywords: [
      "show me problems", "show problems", "any problems", "any issues",
      "what's wrong", "whats wrong", "what is wrong", "show me issues",
    ],
    category: "observe",
    normalized_intent: "observe system problems",
    signal_kind: "process_health",
  },
  {
    keywords: ["why did you", "why did you do that", "explain that", "explain last", "why did that happen"],
    category: "observe",
    normalized_intent: "explain last action",
    signal_kind: "user_input",
  },

  // ── Inspect ────────────────────────────────────────────────────────────────
  {
    keywords: ["check the repo", "check repo", "inspect repo", "check repository", "inspect repository"],
    category: "inspect",
    normalized_intent: "inspect repository state",
    signal_kind: "repo_commit",
  },
  {
    keywords: [
      "check system health", "system health", "check health", "how is the system",
      "system status", "health check",
    ],
    category: "inspect",
    normalized_intent: "inspect system health",
    signal_kind: "process_health",
  },
  {
    keywords: [
      "look at this folder", "look at folder", "check this folder",
      "inspect folder", "check folder", "inspect directory",
    ],
    category: "inspect",
    normalized_intent: "inspect folder contents",
    signal_kind: "file_change_event",
  },
  {
    keywords: [
      "see if anything is wrong", "anything wrong", "check for errors",
      "see if there are issues", "look for problems",
    ],
    category: "inspect",
    normalized_intent: "inspect for anomalies",
    signal_kind: "process_health",
  },

  // ── Safe actions ───────────────────────────────────────────────────────────
  {
    keywords: ["run a safe check", "run safe check", "safe check", "perform a check"],
    category: "safe_action",
    normalized_intent: "run safe system check",
    signal_kind: "user_input",
  },
  {
    keywords: [
      "clean up temp", "cleanup temp", "clean temp files", "remove temp files",
      "clear temp", "delete temp",
    ],
    category: "safe_action",
    normalized_intent: "clean up temporary files",
    signal_kind: "user_input",
    parameters: { scope: "alive-web/tmp" },
  },
  {
    keywords: [
      "watch this folder", "watch folder", "monitor folder",
      "monitor this folder", "watch for changes",
    ],
    category: "safe_action",
    normalized_intent: "watch folder for changes",
    signal_kind: "file_change_event",
  },
  {
    keywords: ["notify me", "alert me", "let me know if", "send me a notification"],
    category: "safe_action",
    normalized_intent: "set up change notification",
    signal_kind: "user_input",
  },
  {
    keywords: ["show git status", "git status", "show status", "show repo status"],
    category: "safe_action",
    normalized_intent: "show repository git status",
    signal_kind: "repo_commit",
  },

  // ── Guided actions ─────────────────────────────────────────────────────────
  {
    keywords: [
      "fix this if it's safe", "fix this if safe", "fix if safe",
      "fix safely", "apply safe fix",
    ],
    category: "guided_action",
    normalized_intent: "attempt safe fix",
    signal_kind: "user_input",
  },
  {
    keywords: [
      "try the safest option", "try safest", "safest option",
      "most safe", "least risky",
    ],
    category: "guided_action",
    normalized_intent: "choose safest available action",
    signal_kind: "user_input",
  },
  {
    keywords: [
      "what would you do", "what would you do next", "recommend next",
      "what do you recommend", "suggest next step", "what next",
    ],
    category: "guided_action",
    normalized_intent: "recommend next action",
    signal_kind: "user_input",
  },
];

// ── Rejection patterns ─────────────────────────────────────────────────────────
// Checked BEFORE Tier 1 patterns. Hard blocks — always reject, never reroute.

const REJECTION_PATTERNS: RejectionPattern[] = [
  {
    keywords: ["rm -rf", "delete all", "wipe ", "format disk", "drop table", "truncate"],
    reason: "Destructive bulk operations are not in the Tier 1 safe action set.",
  },
  {
    keywords: ["git push", "push to ", "deploy ", "publish ", "release "],
    reason: "Remote push and deployment operations are not in the Tier 1 safe action set.",
  },
  {
    keywords: ["npm install", "pip install", "apt-get", "brew install", "yarn add"],
    reason: "Package installation is not in the Tier 1 safe action set.",
  },
  {
    keywords: [
      "override constitution", "bypass constitution", "disable enforcement",
      "ignore safety", "disable firewall", "bypass stg",
    ],
    reason: "Constitutional override attempts are always rejected.",
  },
  {
    keywords: [
      "write a script", "generate code", "create a file", "make me a",
      "write code", "build an app",
    ],
    reason: "Code generation and file creation are not in the Tier 1 safe action set.",
  },
  {
    keywords: ["sudo ", "su -", "chmod 777", "chown root", "passwd "],
    reason: "Privileged system operations are not in the Tier 1 safe action set.",
  },
];

// ── Text normalization ─────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['"?!.,;:]/g, " ")  // strip punctuation to spaces (keeps word boundaries)
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim();
}

function matchesAny(normalized: string, keywords: string[]): boolean {
  // Normalize keywords too so apostrophes, punctuation, and case don't cause misses
  return keywords.some((kw) => normalized.includes(normalize(kw)));
}

// ── Main interpreter ───────────────────────────────────────────────────────────

/**
 * Deterministically interprets a plain-language IntentRequest.
 *
 * Returns IntentResult with:
 *   - rejected: true + rejection_reason for hard blocks and unknown intents
 *   - category + normalized_intent + signal_kind for Tier 1 matches
 *
 * Never throws. Never calls external services. Idempotent given the same input.
 */
export function interpretIntent(req: IntentRequest): IntentResult {
  const normalized = normalize(req.raw_text);
  const now = Date.now();

  // ── [1] Hard rejection check ──────────────────────────────────────────────
  for (const rejection of REJECTION_PATTERNS) {
    if (matchesAny(normalized, rejection.keywords)) {
      return {
        request_id:       req.request_id,
        category:         "unsupported",
        normalized_intent: normalized.slice(0, 80),
        confidence:       0.95,   // high confidence we identified the right rejection
        signal_kind:      "unknown",
        parameters:       {},
        rejected:         true,
        rejection_reason: rejection.reason,
        interpreted_at:   now,
      };
    }
  }

  // ── [2] Tier 1 pattern match ──────────────────────────────────────────────
  for (const pattern of TIER1_PATTERNS) {
    if (matchesAny(normalized, pattern.keywords)) {
      return {
        request_id:       req.request_id,
        category:         pattern.category,
        normalized_intent: pattern.normalized_intent,
        confidence:       0.85,
        signal_kind:      pattern.signal_kind,
        parameters:       pattern.parameters ?? {},
        rejected:         false,
        interpreted_at:   now,
      };
    }
  }

  // ── [3] Too short to interpret safely ─────────────────────────────────────
  if (normalized.length < 5) {
    return {
      request_id:       req.request_id,
      category:         "unsupported",
      normalized_intent: normalized,
      confidence:       0.30,
      signal_kind:      "unknown",
      parameters:       {},
      rejected:         true,
      rejection_reason: "Request too short or empty to interpret safely.",
      interpreted_at:   now,
    };
  }

  // ── [4] No match — reject cleanly ─────────────────────────────────────────
  const preview = req.raw_text.slice(0, 60);
  return {
    request_id:       req.request_id,
    category:         "unsupported",
    normalized_intent: normalized.slice(0, 80),
    confidence:       0.20,
    signal_kind:      "unknown",
    parameters:       {},
    rejected:         true,
    rejection_reason: `"${preview}" is not in the current Tier 1 supported intent set. `
      + `Supported: observe changes/failures/problems, inspect repo/system health, `
      + `run safe checks, show git status, clean temp files, watch folders, `
      + `guide safe fixes.`,
    interpreted_at:   now,
  };
}
