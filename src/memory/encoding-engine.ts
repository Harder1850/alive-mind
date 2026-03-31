import {
  type BaseMemoryRecord,
  type EpisodeRecord,
  type ReferenceRecord,
  type SalienceScore,
  type WorkingRecord,
  type ThreadRecord,
} from "./types";

export type IncomingObservation = {
  id: string;
  text: string;
  exactKey?: string;
  exactValue?: unknown;
  currentThreadId?: string;
  salience: SalienceScore;
  timestamp: number;
};

export type EncodingDecision =
  | { target: "reference"; record: ReferenceRecord }
  | { target: "episode"; record: EpisodeRecord }
  | { target: "thread"; record: ThreadRecord }
  | { target: "working"; record: WorkingRecord }
  | { target: "discard"; reason: string };

export function chooseEncodingTarget(obs: IncomingObservation): EncodingDecision {
  const s = obs.salience;
  const total = s.novelty + s.impact + s.goalRelevance + s.recurrence + s.trust + s.urgency;

  if (obs.exactKey && typeof obs.exactValue !== "undefined" && s.goalRelevance >= 0.5) {
    return {
      target: "reference",
      record: {
        id: obs.id,
        kind: "reference",
        createdAt: obs.timestamp,
        updatedAt: obs.timestamp,
        confidence: Math.max(0.5, s.trust),
        trust: s.trust,
        tags: [],
        sourceRefs: [],
        key: obs.exactKey,
        value: obs.exactValue,
      },
    };
  }

  if (obs.currentThreadId && s.goalRelevance >= 0.6) {
    return {
      target: "thread",
      record: {
        id: obs.currentThreadId,
        kind: "thread",
        createdAt: obs.timestamp,
        updatedAt: obs.timestamp,
        confidence: 0.7,
        trust: s.trust,
        tags: [],
        sourceRefs: [],
        title: obs.text.slice(0, 60),
        horizon: "short_term",
        status: "active",
        summary: obs.text,
        linkedGoalIds: [],
        linkedMemoryIds: [],
      },
    };
  }

  if (total >= 2.2 || s.impact >= 0.7 || s.urgency >= 0.7) {
    return {
      target: "episode",
      record: {
        id: obs.id,
        kind: "episode",
        createdAt: obs.timestamp,
        updatedAt: obs.timestamp,
        confidence: 0.7,
        trust: s.trust,
        tags: [],
        sourceRefs: [],
        cue: obs.text,
        context: [],
        impactScore: s.impact,
      },
    };
  }

  if (total >= 1.2) {
    return {
      target: "working",
      record: {
        id: obs.id,
        kind: "working",
        createdAt: obs.timestamp,
        updatedAt: obs.timestamp,
        confidence: 0.6,
        trust: s.trust,
        tags: [],
        sourceRefs: [],
        cue: obs.text,
      },
    };
  }

  return { target: "discard", reason: "below useful threshold" };
}
