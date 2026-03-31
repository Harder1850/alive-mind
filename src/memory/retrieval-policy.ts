import type { ContradictionRecord } from "./types";

export interface RetrievalPolicyInput {
  maxItems: number;
  contradictionPressure: ContradictionRecord[];
}

export interface RetrievalPolicyResult {
  referenceBudget: number;
  procedureBudget: number;
  episodicBudget: number;
  semanticBudget: number;
  threadBudget: number;
}

/**
 * Keep retrieval bounded and simple.
 * High contradiction pressure tightens broad recall and keeps exact/procedure retrieval favored.
 */
export function computeRetrievalPolicy(input: RetrievalPolicyInput): RetrievalPolicyResult {
  const max = Math.max(4, input.maxItems);
  const pressure = Math.max(0, input.contradictionPressure.reduce((acc, c) => acc + c.pressure, 0));

  const tighten = pressure >= 1.0 ? 1 : 0;

  const referenceBudget = Math.max(1, Math.floor(max * 0.3));
  const procedureBudget = Math.max(1, Math.floor(max * 0.25));
  const episodicBudget = Math.max(1, Math.floor(max * (tighten ? 0.2 : 0.25)));
  const semanticBudget = Math.max(1, Math.floor(max * (tighten ? 0.15 : 0.2)));
  const used = referenceBudget + procedureBudget + episodicBudget + semanticBudget;
  const threadBudget = Math.max(1, max - used);

  return {
    referenceBudget,
    procedureBudget,
    episodicBudget,
    semanticBudget,
    threadBudget,
  };
}
