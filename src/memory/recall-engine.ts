import { computeRetrievalPolicy } from "./retrieval-policy";
import {
  type ContradictionRecord,
  type EpisodeRecord,
  type ProcedureRecord,
  type ReferenceRecord,
  type SemanticRecord,
  type ThreadRecord,
} from "./types";
import type { WorkingItem } from "./memory-types";

export type RecallContext = {
  cue: string;
  activeGoal?: string;
  activeThreadIds: string[];
  maxItems: number;
};

export type RecallInput = {
  working: WorkingItem[];
  references: ReferenceRecord[];
  procedures: ProcedureRecord[];
  episodes: EpisodeRecord[];
  semantics: SemanticRecord[];
  threads: ThreadRecord[];
  contradictions: ContradictionRecord[];
};

export type RecallResult = {
  working: WorkingItem[];
  references: ReferenceRecord[];
  procedures: ProcedureRecord[];
  episodes: EpisodeRecord[];
  semantics: SemanticRecord[];
  threads: ThreadRecord[];
  contradictions: ContradictionRecord[];
};

function scoreTextMatch(cue: string, text: string): number {
  const c = cue.toLowerCase();
  const t = text.toLowerCase();
  if (!c || !t) return 0;
  if (t.includes(c)) return 1;
  if (c.split(/\s+/).some((part) => part && t.includes(part))) return 0.6;
  return 0;
}

export function recallTop(ctx: RecallContext, input: RecallInput): RecallResult {
  const max = Math.max(1, ctx.maxItems);
  const policy = computeRetrievalPolicy({ maxItems: max, contradictionPressure: input.contradictions });
  const workingBudget = Math.max(1, Math.min(3, Math.floor(max / 3)));

  const working = input.working
    .map((w) => ({
      item: w,
      score: scoreTextMatch(ctx.cue, `${w.kind} ${String(w.value)}`) + w.priority,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, workingBudget);

  const references = input.references
    .filter((r) => scoreTextMatch(ctx.cue, r.key) > 0)
    .slice(0, policy.referenceBudget);

  const procedures = input.procedures
    .map((p) => ({ item: p, score: scoreTextMatch(ctx.cue, p.trigger) + p.reliability }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, policy.procedureBudget);

  const episodes = input.episodes
    .map((e) => ({ item: e, score: scoreTextMatch(ctx.cue, e.cue) + e.impactScore + e.trust }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, policy.episodicBudget);

  const semantics = input.semantics
    .map((s) => ({ item: s, score: scoreTextMatch(ctx.cue, `${s.symbol} ${s.meaning}`) + s.trust }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
    .slice(0, policy.semanticBudget);

  const threads = input.threads
    .filter(
      (t) =>
        ctx.activeThreadIds.includes(t.id) || scoreTextMatch(ctx.cue, `${t.title} ${t.summary}`) > 0
    )
    .slice(0, policy.threadBudget);

  const contradictions = input.contradictions.filter((c) => c.pressure >= 0.5).slice(0, 2);

  return { working, references, procedures, episodes, semantics, threads, contradictions };
}
