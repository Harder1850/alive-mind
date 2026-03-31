export type ID = string;

export interface Episode {
  id: ID;
  entities: ID[];
  context: string[];
  time: number;
  outcome?: string;
  salience: number;
  confidence: number;
  uncertainty: number;
}

export interface StructNode {
  id: ID;
  type: string;
  traits: Record<string, unknown>;
}

export interface AssocEdge {
  from: ID;
  to: ID;
  type: string;
  weight: number;
}

export interface RefItem {
  key: string;
  value: unknown;
  confidence: number;
}

export interface WorkingItem {
  id: ID;
  kind: string;
  value: unknown;
  priority: number;
  expiresAt?: number;
}

export interface MemoryEvent {
  id: ID;
  cue: string;
  entities?: ID[];
  context?: string[];
  exactFacts?: Array<{ key: string; value: unknown; confidence?: number }>;
  traits?: Array<{ id: ID; type: string; traits: Record<string, unknown> }>;
  salience?: number;
  confidence?: number;
  uncertainty?: number;
  time?: number;
}

export interface RecallRequest {
  cue: string;
  context?: string[];
  precisionNeed?: "low" | "medium" | "high";
  activeGoal?: string;
  activeThread?: string;
}

export interface RecallCandidate {
  id: string;
  source: "working" | "episodic" | "structural" | "reference" | "associative";
  confidence: number;
  summary: string;
  payload: unknown;
}
