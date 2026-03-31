import type { Action } from "../../../alive-constitution/contracts/action";
import type { Signal } from "../../../alive-constitution/contracts/signal";

import { MemoryOrchestrator } from "../memory/memory-orchestrator";
import { Phase1Memory } from "../memory/phase1-memory";
import type { RecallCandidate } from "../memory/memory-types";
import type { OutcomeRecord } from "../memory/types";

export interface Phase1CognitionOutput {
  interpretedSummary: string;
  recalledItems: RecallCandidate[];
  candidateAction: Action;
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

function makeCandidateAction(signal: Signal, recalledCount: number): Action {
  const text = String(signal.raw_content ?? "");
  if (signal.kind === "file_change_event") {
    return {
      type: "display_text",
      payload: `Observed file-change event. ${recalledCount > 0 ? `Recalled ${recalledCount} related items.` : "No strong prior links."}`,
      is_reversible: true,
    };
  }
  return {
    type: "display_text",
    payload: `Signal ${signal.kind}: ${text.slice(0, 120)}`,
    is_reversible: true,
  };
}

export function runPhase1CognitionLoop(input: {
  signal: Signal;
  normalizedCue: string;
  context?: string[];
  deepCognitionOpened: boolean;
}): Phase1CognitionOutput {
  const { signal, normalizedCue, context = [], deepCognitionOpened } = input;

  const salience = deepCognitionOpened ? 0.8 : 0.45;

  // Phase1Memory: encode for multi-store recall (working, episodic, structural, reference, associative).
  // Working-store writes land in the shared phase1Memory.working instance.
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

  // MemoryOrchestrator: encode for reference/thread/episode routing with salience scoring.
  // If this routes to "working", it writes into the shared phase1Memory.working instance.
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

  const candidateAction = makeCandidateAction(signal, recalledItems.length);
  const confidence = Math.max(0.35, Math.min(0.95, signal.confidence * 0.6 + recalledItems.length * 0.03));
  const interpretedSummary = `Signal from ${signal.source}/${signal.kind}: ${normalizedCue.slice(0, 160)}`;
  const reasoningSummary = deepCognitionOpened
    ? `Deep cognition opened. Recalled ${recalledItems.length} items before generating candidate action.`
    : `Baseline interpretation only. Recalled ${recalledItems.length} lightweight items.`;

  lastSummary = interpretedSummary;
  lastActionType = candidateAction.type;

  return {
    interpretedSummary,
    recalledItems,
    candidateAction,
    confidence,
    reasoningSummary,
    deepCognitionOpened,
  };
}

export function pushPhase1Outcome(feedback: Phase1OutcomeFeedback): void {
  // Phase1Memory: encode outcome into working store for immediate recall.
  // Writes to the shared phase1Memory.working instance.
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
