export interface DecisionContext {
  threadId?: string;
  goals: string[];
  recalledRefs: string[];
  unresolvedContradictions: string[];
}
