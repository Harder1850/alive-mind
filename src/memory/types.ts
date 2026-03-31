export type MemoryKind =
  | "reference"
  | "working"
  | "episode"
  | "semantic"
  | "procedure"
  | "thread"
  | "contradiction"
  | "outcome";

export type SalienceScore = {
  novelty: number;
  impact: number;
  goalRelevance: number;
  recurrence: number;
  trust: number;
  urgency: number;
};

export interface BaseMemoryRecord {
  id: string;
  kind: MemoryKind;
  createdAt: number;
  updatedAt: number;
  confidence: number;
  trust: number;
  tags: string[];
  sourceRefs: string[];
}

export interface ReferenceRecord extends BaseMemoryRecord {
  kind: "reference";
  key: string;
  value: unknown;
}

export interface WorkingRecord extends BaseMemoryRecord {
  kind: "working";
  cue: string;
}

export interface EpisodeRecord extends BaseMemoryRecord {
  kind: "episode";
  cue: string;
  context: string[];
  action?: string;
  outcome?: "success" | "failure" | "partial" | "unknown";
  impactScore: number;
}

export interface SemanticRecord extends BaseMemoryRecord {
  kind: "semantic";
  symbol: string;
  meaning: string;
  relatedIds: string[];
}

export interface ProcedureRecord extends BaseMemoryRecord {
  kind: "procedure";
  trigger: string;
  steps: string[];
  reliability: number;
}

export interface ThreadRecord extends BaseMemoryRecord {
  kind: "thread";
  title: string;
  horizon: "immediate" | "today" | "short_term" | "long_term";
  status: "active" | "warm" | "suspended" | "waiting" | "resolved";
  summary: string;
  nextStep?: string;
  linkedGoalIds: string[];
  linkedMemoryIds: string[];
}

export interface ContradictionRecord extends BaseMemoryRecord {
  kind: "contradiction";
  leftRef: string;
  rightRef: string;
  severity: number;
  pressure: number;
}

export interface OutcomeRecord extends BaseMemoryRecord {
  kind: "outcome";
  actionId: string;
  goalId?: string;
  observedResult: "success" | "failure" | "partial" | "unknown";
  discrepancyScore: number;
  stateDelta: Record<string, unknown>;
}

export type AnyMemoryRecord =
  | ReferenceRecord
  | WorkingRecord
  | EpisodeRecord
  | SemanticRecord
  | ProcedureRecord
  | ThreadRecord
  | ContradictionRecord
  | OutcomeRecord;
