import test from "node:test";
import assert from "node:assert/strict";

import { chooseEncodingTarget } from "../src/memory/encoding-engine";
import { OutcomeBuffer } from "../src/memory/outcome-buffer";
import { recallTop } from "../src/memory/recall-engine";
import { ThreadStore } from "../src/memory/thread-store";
import type { ContradictionRecord, OutcomeRecord } from "../src/memory/types";

test("encoding selects reference for exact key/value with relevance", () => {
  const decision = chooseEncodingTarget({
    id: "obs-1",
    text: "max voltage",
    exactKey: "voltage.max",
    exactValue: 480,
    salience: { novelty: 0.2, impact: 0.4, goalRelevance: 0.8, recurrence: 0.4, trust: 0.9, urgency: 0.2 },
    timestamp: Date.now(),
  });

  assert.equal(decision.target, "reference");
});

test("recallTop keeps bounded retrieval slices", () => {
  const contradictions: ContradictionRecord[] = [];
  const result = recallTop(
    { cue: "router error", activeThreadIds: [], maxItems: 8 },
    {
      working: [],
      references: Array.from({ length: 10 }, (_, i) => ({
        id: `r-${i}`,
        kind: "reference" as const,
        createdAt: 1,
        updatedAt: 1,
        confidence: 0.8,
        trust: 0.8,
        tags: [],
        sourceRefs: [],
        key: `router error ${i}`,
        value: i,
      })),
      procedures: Array.from({ length: 10 }, (_, i) => ({
        id: `p-${i}`,
        kind: "procedure" as const,
        createdAt: 1,
        updatedAt: 1,
        confidence: 0.8,
        trust: 0.8,
        tags: [],
        sourceRefs: [],
        trigger: `router error ${i}`,
        steps: ["a"],
        reliability: 0.7,
      })),
      episodes: Array.from({ length: 10 }, (_, i) => ({
        id: `e-${i}`,
        kind: "episode" as const,
        createdAt: 1,
        updatedAt: 1,
        confidence: 0.8,
        trust: 0.8,
        tags: [],
        sourceRefs: [],
        cue: `router error ${i}`,
        context: [],
        impactScore: 0.6,
      })),
      semantics: Array.from({ length: 10 }, (_, i) => ({
        id: `s-${i}`,
        kind: "semantic" as const,
        createdAt: 1,
        updatedAt: 1,
        confidence: 0.8,
        trust: 0.8,
        tags: [],
        sourceRefs: [],
        symbol: `router-${i}`,
        meaning: "error",
        relatedIds: [],
      })),
      threads: [],
      contradictions,
    }
  );

  assert.ok(result.references.length <= 2);
  assert.ok(result.procedures.length <= 2);
  assert.ok(result.episodes.length <= 2);
  assert.ok(result.semantics.length <= 2);
  assert.ok(result.working.length <= 2);
});

test("thread matching finds relevant cues", () => {
  const store = new ThreadStore();
  store.upsert({
    id: "t-1",
    kind: "thread",
    createdAt: 1,
    updatedAt: 1,
    confidence: 0.8,
    trust: 0.8,
    tags: [],
    sourceRefs: [],
    title: "Runtime routing hardening",
    horizon: "short_term",
    status: "active",
    summary: "Investigate router regressions",
    linkedGoalIds: [],
    linkedMemoryIds: [],
  });

  const matched = store.matchByCue("routing regression");
  assert.equal(matched.length, 1);
});

test("outcome buffer trims to capacity", () => {
  const buffer = new OutcomeBuffer(3);

  const mk = (i: number): OutcomeRecord => ({
    id: `o-${i}`,
    kind: "outcome",
    createdAt: i,
    updatedAt: i,
    confidence: 0.7,
    trust: 0.7,
    tags: [],
    sourceRefs: [],
    actionId: `a-${i}`,
    observedResult: "success",
    discrepancyScore: 0,
    stateDelta: {},
  });

  buffer.append(mk(1));
  buffer.append(mk(2));
  buffer.append(mk(3));
  buffer.append(mk(4));

  const list = buffer.list();
  assert.equal(list.length, 3);
  assert.equal(list[0]?.id, "o-2");
  assert.equal(list[2]?.id, "o-4");
});
