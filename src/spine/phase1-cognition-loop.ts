import type { Action } from "../../../alive-constitution/contracts/action";
import type { Signal } from "../../../alive-constitution/contracts/signal";

import { MemoryOrchestrator } from "../memory/memory-orchestrator";
import { Phase1Memory } from "../memory/phase1-memory";
import type { RecallCandidate } from "../memory/memory-types";
import type { OutcomeRecord } from "../memory/types";

// ── ActionCandidate ────────────────────────────────────────────────────────────
// The mind's richer intermediate output — wraps the constitution Action with
// scoring and rationale metadata.  Lives here (mind layer) because it is a
// cognitive reasoning artifact.  Runtime translates it into whitelist decisions
// and body execution calls.

export type ActionCandidateType =
  | 'ignore'
  | 'monitor'
  | 'notify'
  | 'recommend'
  | 'safe_file_edit'
  | 'safe_command_run'
  | 'cleanup_temp'
  | 'git_status_check';

export interface ActionCandidate {
  candidate_id: string;
  action_type: ActionCandidateType;
  rationale: string;
  confidence_score: number;       // 0.0–1.0
  risk_score: number;             // 0.0–1.0 (lower = safer)
  reversibility_score: number;    // 0.0–1.0 (higher = more reversible)
  requires_human_approval: boolean;
  support_refs: string[];         // signal IDs, memory refs, rule IDs
}

// ── Risk/reversibility tables (authoritative in mind layer) ───────────────────

const ACTION_RISK: Record<ActionCandidateType, number> = {
  ignore:           0.00,
  monitor:          0.02,
  notify:           0.05,
  git_status_check: 0.05,
  recommend:        0.10,
  cleanup_temp:     0.20,
  safe_file_edit:   0.25,
  safe_command_run: 0.35,
};

const ACTION_REVERSIBILITY: Record<ActionCandidateType, number> = {
  ignore:           1.00,
  monitor:          1.00,
  notify:           1.00,
  git_status_check: 1.00,
  recommend:        1.00,
  safe_file_edit:   0.80,
  cleanup_temp:     0.40,
  safe_command_run: 0.50,
};

// ── Phase1CognitionOutput ──────────────────────────────────────────────────────

export interface Phase1CognitionOutput {
  interpretedSummary: string;
  recalledItems: RecallCandidate[];
  candidateAction: Action;            // constitution Action (backward compat)
  actionCandidate: ActionCandidate;   // richer proving-scenario candidate
  confidence: number;
  reasoningSummary: string;
  deepCognitionOpened: boolean;
}

export interface Phase1OutcomeFeedback {
  signalId: string;
  success: boolean;
  note: string;
  timestamp: number;
}

export interface Phase1StudioMemoryBridgeSnapshot {
  workingMemorySample: unknown[];
  recentEpisodesSample: unknown[];
  referenceItemSample: unknown[];
  threadSummarySample: unknown[];
  outcomeBufferSample: unknown[];
  structuralNodeSample: unknown[];
  associationSample: unknown[];
}

// Phase1Memory is the authoritative recall engine (working, episodic, structural, reference, associative).
// MemoryOrchestrator handles structured encoding (reference/thread/episode) and outcome buffering.
//
// Working memory is SHARED: phase1Memory.working is injected into the orchestrator so both encode
// paths write to one TTL-aware WorkingMemory instance — no parallel working-memory truth.
//
// Both are module-level singletons — stateful across calls within a process lifetime.
const phase1Memory = new Phase1Memory();
const orchestrator = new MemoryOrchestrator(phase1Memory.working);

let lastSummary = "";
let lastActionType = "display_text";

// ── Action type selection ─────────────────────────────────────────────────────

/**
 * Choose an ActionCandidateType from the signal kind and cognition depth.
 * Logic is deterministic and grounded in what we actually know about the signal.
 */
function chooseActionType(signal: Signal, deepCognitionOpened: boolean, recalledCount: number): ActionCandidateType {
  const raw = String(signal.raw_content ?? "").toLowerCase();

  // Explicit error/failure content → notify
  if (raw.includes("error") || raw.includes("fail") || raw.includes("crash")) {
    return "notify";
  }

  switch (signal.kind) {
    case "file_change_event":
      // Deep cognition or prior memory context → inspect git to understand what changed
      return deepCognitionOpened || recalledCount > 0 ? "git_status_check" : "monitor";

    case "repo_commit":
    case "repo_pr":
      return "git_status_check";

    case "user_input":
      // Respond to explicit user requests with a recommendation
      return "recommend";

    case "process_error":
      return "notify";

    case "process_health":
      // Low battery / degraded health → notify; otherwise monitor
      if (signal.urgency > 0.6 || signal.threat_flag) return "notify";
      return "monitor";

    case "cpu_utilization":
    case "disk_available":
    case "system_startup":
      return "monitor";

    default:
      return deepCognitionOpened ? "recommend" : "monitor";
  }
}

// ── Candidate builder ─────────────────────────────────────────────────────────

function buildActionCandidate(
  signal: Signal,
  actionType: ActionCandidateType,
  confidence: number,
  recalledItems: RecallCandidate[],
  deepCognitionOpened: boolean,
): ActionCandidate {
  const risk = ACTION_RISK[actionType];
  const rev  = ACTION_REVERSIBILITY[actionType];

  const rationale = buildRationale(signal, actionType, recalledItems, deepCognitionOpened);

  return {
    candidate_id:           `cand-${signal.id}`,
    action_type:            actionType,
    rationale,
    confidence_score:       Math.round(confidence * 1000) / 1000,
    risk_score:             risk,
    reversibility_score:    rev,
    requires_human_approval: risk > 0.2,
    support_refs:           [signal.id, ...recalledItems.slice(0, 3).map((r) => r.id)],
  };
}

function buildRationale(
  signal: Signal,
  actionType: ActionCandidateType,
  recalled: RecallCandidate[],
  deep: boolean,
): string {
  const src = `${signal.source}/${signal.kind}`;
  const mem = recalled.length > 0 ? ` (${recalled.length} memory items recalled)` : "";
  const depth = deep ? " [deep cognition]" : " [baseline]";

  switch (actionType) {
    case "git_status_check":
      return `File-change detected from ${src}${mem}${depth} — inspecting repository state to understand scope of change`;
    case "notify":
      return `Signal from ${src} indicates degraded state or error condition${mem}${depth} — surfacing for human awareness`;
    case "monitor":
      return `Signal from ${src} is within normal parameters${mem}${depth} — continuing passive observation`;
    case "recommend":
      return `Explicit input from ${src}${mem}${depth} — generating advisory response without autonomous action`;
    case "safe_file_edit":
      return `Signal from ${src}${mem}${depth} — proposing targeted file edit in sandbox path`;
    case "cleanup_temp":
      return `Signal from ${src}${mem}${depth} — temporary files detected, proposing scoped cleanup`;
    case "safe_command_run":
      return `Signal from ${src}${mem}${depth} — proposing a safe read-only command`;
    case "ignore":
      return `Signal from ${src} is below salience threshold${depth} — no action warranted`;
  }
}

// ── Constitution Action builder (backward compat) ────────────────────────────

function makeCandidateAction(signal: Signal, actionCandidate: ActionCandidate): Action {
  if (signal.kind === "file_change_event" || actionCandidate.action_type === "git_status_check") {
    return {
      type: "display_text",
      payload: actionCandidate.rationale,
      is_reversible: true,
    };
  }
  return {
    type: "display_text",
    payload: `[${actionCandidate.action_type.toUpperCase()}] ${actionCandidate.rationale}`,
    is_reversible: true,
  };
}

// ── Main cognition loop ───────────────────────────────────────────────────────

export function runPhase1CognitionLoop(input: {
  signal: Signal;
  normalizedCue: string;
  context?: string[];
  deepCognitionOpened: boolean;
}): Phase1CognitionOutput {
  const { signal, normalizedCue, context = [], deepCognitionOpened } = input;

  const salience = deepCognitionOpened ? 0.8 : 0.45;

  // Phase1Memory: encode for multi-store recall (working, episodic, structural, reference, associative).
  phase1Memory.encode({
    id: signal.id,
    cue: normalizedCue,
    entities: [signal.source, signal.kind],
    context,
    salience,
    confidence: signal.confidence,
    uncertainty: Math.max(0, 1 - signal.confidence),
    time: signal.timestamp,
    exactFacts: [
      { key: `signal.kind.${signal.id}`, value: signal.kind, confidence: signal.confidence },
    ],
    traits: [
      {
        id: `signal:${signal.kind}`,
        type: "signal_kind",
        traits: { kind: signal.kind, source: signal.source },
      },
    ],
  });

  // MemoryOrchestrator: encode for reference/thread/episode routing.
  orchestrator.encode({
    id: signal.id,
    text: normalizedCue,
    exactKey: `signal.kind.${signal.id}`,
    exactValue: signal.kind,
    salience: {
      novelty: 0.5,
      impact: salience >= 0.7 ? 0.7 : 0.4,
      goalRelevance: 0.5,
      recurrence: 0.3,
      trust: signal.confidence,
      urgency: signal.urgency,
    },
    timestamp: signal.timestamp,
  });

  const recalledItems = phase1Memory.recall({
    cue: normalizedCue,
    context,
    precisionNeed: deepCognitionOpened ? "high" : "medium",
  });

  const confidence = Math.max(0.35, Math.min(0.95, signal.confidence * 0.6 + recalledItems.length * 0.03));
  const actionType = chooseActionType(signal, deepCognitionOpened, recalledItems.length);

  const actionCandidate = buildActionCandidate(signal, actionType, confidence, recalledItems, deepCognitionOpened);
  const candidateAction = makeCandidateAction(signal, actionCandidate);

  const interpretedSummary = `Signal from ${signal.source}/${signal.kind}: ${normalizedCue.slice(0, 160)}`;
  const reasoningSummary = deepCognitionOpened
    ? `Deep cognition opened. Recalled ${recalledItems.length} items. Selected action: ${actionType}.`
    : `Baseline interpretation. Recalled ${recalledItems.length} items. Selected action: ${actionType}.`;

  lastSummary = interpretedSummary;
  lastActionType = candidateAction.type;

  return {
    interpretedSummary,
    recalledItems,
    candidateAction,
    actionCandidate,
    confidence,
    reasoningSummary,
    deepCognitionOpened,
  };
}

export function pushPhase1Outcome(feedback: Phase1OutcomeFeedback): void {
  // Phase1Memory: encode outcome into working store for immediate recall.
  phase1Memory.encodeOutcome(
    feedback.signalId,
    `${feedback.success ? "success" : "failure"}: ${feedback.note}`,
    feedback.success ? 0.85 : 0.45
  );

  // MemoryOrchestrator: record in OutcomeBuffer for durable outcome tracking.
  const outcomeRecord: OutcomeRecord = {
    id: `outcome:${feedback.signalId}`,
    kind: "outcome",
    createdAt: feedback.timestamp,
    updatedAt: feedback.timestamp,
    confidence: feedback.success ? 0.85 : 0.45,
    trust: 0.7,
    tags: [],
    sourceRefs: [],
    actionId: feedback.signalId,
    observedResult: feedback.success ? "success" : "failure",
    discrepancyScore: feedback.success ? 0 : 0.5,
    stateDelta: { note: feedback.note },
  };
  orchestrator.appendOutcome(outcomeRecord);
}

export function getPhase1MemorySnapshot() {
  return phase1Memory.snapshot();
}

export function getPhase1StudioMemoryBridgeSnapshot(): Phase1StudioMemoryBridgeSnapshot {
  const snapshot = phase1Memory.snapshot();

  const threadSummarySample = orchestrator.threads
    .list()
    .map((thread) => ({
      id: thread.id,
      title: thread.title,
      status: thread.status,
      horizon: thread.horizon,
      summary: thread.summary,
      nextStep: thread.nextStep,
      updatedAt: thread.updatedAt,
    }))
    .slice(0, 5);

  const outcomeBufferSample = orchestrator
    .outcomes
    .list()
    .slice(-5)
    .reverse()
    .map((outcome) => ({
      id: outcome.id,
      actionId: outcome.actionId,
      observedResult: outcome.observedResult,
      discrepancyScore: outcome.discrepancyScore,
      stateDelta: outcome.stateDelta,
      updatedAt: outcome.updatedAt,
    }));

  const referenceItemSample = orchestrator.references
    .list()
    .slice(0, 5)
    .map((ref) => ({
      id: ref.id,
      key: ref.key,
      value: ref.value,
      confidence: ref.confidence,
      updatedAt: ref.updatedAt,
    }));

  return {
    workingMemorySample: snapshot.working.slice(0, 5),
    recentEpisodesSample: snapshot.episodes.slice(0, 5),
    referenceItemSample,
    threadSummarySample,
    outcomeBufferSample,
    structuralNodeSample: snapshot.structuralNodes.slice(0, 3),
    associationSample: snapshot.associations.slice(0, 5),
  };
}

export function getPhase1LoopSummary() {
  return {
    interpretedSummary: lastSummary,
    candidateActionType: lastActionType,
  };
}

/** Exposes the MemoryOrchestrator for callers that need direct access to thread/outcome stores. */
export function getPhase1Orchestrator(): MemoryOrchestrator {
  return orchestrator;
}
