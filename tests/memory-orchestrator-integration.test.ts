import test from "node:test";
import assert from "node:assert/strict";

import { MemoryOrchestrator } from "../src/memory/memory-orchestrator";
import { Phase1Memory } from "../src/memory/phase1-memory";
import { recallTop } from "../src/memory/recall-engine";
import type { ContradictionRecord, OutcomeRecord } from "../src/memory/types";

// ---------------------------------------------------------------------------
// Orchestrated encode → recall
// ---------------------------------------------------------------------------

test("orchestrator encodes observation into reference store and recalls it by cue", () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.encode({
    id: "obs-1",
    text: "disk pressure rising",
    exactKey: "disk.status",
    exactValue: "warning",
    salience: {
      novelty: 0.6,
      impact: 0.8,
      goalRelevance: 0.7,
      recurrence: 0.4,
      trust: 0.9,
      urgency: 0.7,
    },
    timestamp: Date.now(),
  });

  const result = orchestrator.recall({
    cue: "disk pressure",
    activeThreadIds: [],
    maxItems: 8,
  });

  // chooseEncodingTarget routes exactKey + goalRelevance>=0.5 → reference store
  assert.ok(result.references.length > 0, "expected reference to be recalled");
  assert.equal(result.references[0]?.key, "disk.status");
});

test("orchestrator encodes high-salience observation into episode store", () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.encode({
    id: "obs-2",
    text: "cpu spike detected",
    salience: {
      novelty: 0.5,
      impact: 0.9, // >= 0.7 → episode
      goalRelevance: 0.4,
      recurrence: 0.3,
      trust: 0.8,
      urgency: 0.8,
    },
    timestamp: Date.now(),
  });

  const result = orchestrator.recall({
    cue: "cpu spike",
    activeThreadIds: [],
    maxItems: 8,
  });

  assert.ok(result.episodes.length > 0, "expected episode to be recalled");
});

// ---------------------------------------------------------------------------
// Retrieval-policy budget enforcement
// ---------------------------------------------------------------------------

test("retrieval policy tightens episodic and semantic budgets under contradiction pressure", () => {
  const mkEpisode = (i: number) => ({
    id: `e-${i}`,
    kind: "episode" as const,
    createdAt: 1,
    updatedAt: 1,
    confidence: 0.7,
    trust: 0.7,
    tags: [] as string[],
    sourceRefs: [] as string[],
    cue: `failure mode ${i}`,
    context: [] as string[],
    impactScore: 0.5,
  });

  const mkSemantic = (i: number) => ({
    id: `s-${i}`,
    kind: "semantic" as const,
    createdAt: 1,
    updatedAt: 1,
    confidence: 0.7,
    trust: 0.7,
    tags: [] as string[],
    sourceRefs: [] as string[],
    symbol: `fail-${i}`,
    meaning: "failure",
    relatedIds: [] as string[],
  });

  const highPressure: ContradictionRecord[] = [
    {
      id: "c-1",
      kind: "contradiction",
      createdAt: 1,
      updatedAt: 1,
      confidence: 0.9,
      trust: 0.8,
      tags: [],
      sourceRefs: [],
      leftRef: "a",
      rightRef: "b",
      severity: 0.9,
      pressure: 0.8,
    },
    {
      id: "c-2",
      kind: "contradiction",
      createdAt: 1,
      updatedAt: 1,
      confidence: 0.8,
      trust: 0.7,
      tags: [],
      sourceRefs: [],
      leftRef: "c",
      rightRef: "d",
      severity: 0.7,
      pressure: 0.6,
    },
  ];

  const baseInput = {
    working: [],
    references: [],
    procedures: [],
    episodes: Array.from({ length: 10 }, (_, i) => mkEpisode(i)),
    semantics: Array.from({ length: 10 }, (_, i) => mkSemantic(i)),
    threads: [],
  };

  const noPressure = recallTop(
    { cue: "failure", activeThreadIds: [], maxItems: 16 },
    { ...baseInput, contradictions: [] }
  );

  const withPressure = recallTop(
    { cue: "failure", activeThreadIds: [], maxItems: 16 },
    { ...baseInput, contradictions: highPressure }
  );

  // Tighten flag activates when total pressure >= 1.0 (0.8 + 0.6 = 1.4)
  assert.ok(
    withPressure.episodes.length <= noPressure.episodes.length,
    `high pressure should not expand episodic recall (got ${withPressure.episodes.length} vs ${noPressure.episodes.length})`
  );
  assert.ok(
    withPressure.semantics.length <= noPressure.semantics.length,
    `high pressure should not expand semantic recall (got ${withPressure.semantics.length} vs ${noPressure.semantics.length})`
  );
});

test("retrieval policy respects maxItems budget across all buckets", () => {
  const result = recallTop(
    { cue: "error", activeThreadIds: [], maxItems: 4 },
    {
      working: [],
      references: Array.from({ length: 5 }, (_, i) => ({
        id: `r-${i}`,
        kind: "reference" as const,
        createdAt: 1,
        updatedAt: 1,
        confidence: 0.8,
        trust: 0.8,
        tags: [],
        sourceRefs: [],
        key: `error type ${i}`,
        value: i,
      })),
      procedures: [],
      episodes: [],
      semantics: [],
      threads: [],
      contradictions: [],
    }
  );

  // referenceBudget for maxItems=4: Math.max(1, floor(4*0.3)) = 1
  assert.ok(result.references.length <= 1, `expected reference budget ≤ 1, got ${result.references.length}`);
});

test("orchestrator working memory write/read goes through unified TTL-aware store", () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.writeWorking({
    id: "wk-1",
    kind: "manual",
    value: "hot context",
    priority: 0.9,
    expiresAt: Date.now() + 60_000,
  });

  const item = orchestrator.getWorking("wk-1");
  assert.ok(item, "expected working item to be retrievable");
  assert.equal(item?.value, "hot context");
  assert.ok(orchestrator.listWorking().some((x) => x.id === "wk-1"));
});

test("orchestrator working memory TTL expiry is respected", async () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.writeWorking({
    id: "wk-expire",
    kind: "ttl",
    value: "short lived",
    priority: 0.8,
    expiresAt: Date.now() + 5,
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(orchestrator.getWorking("wk-expire"), undefined);
  assert.ok(!orchestrator.listWorking().some((x) => x.id === "wk-expire"));
});

test("orchestrator recall returns hot recent working items", () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.writeWorking({
    id: "wk-hot",
    kind: "signal",
    value: "runtime router mismatch",
    priority: 0.95,
    expiresAt: Date.now() + 60_000,
  });

  const result = orchestrator.recall({
    cue: "router",
    activeThreadIds: [],
    maxItems: 8,
  });

  assert.ok(result.working.some((w) => w.id === "wk-hot"));
});

// ---------------------------------------------------------------------------
// OutcomeBuffer → memory integration
// ---------------------------------------------------------------------------

test("outcome buffer records and lists pushed outcomes", () => {
  const orchestrator = new MemoryOrchestrator();

  const outcome: OutcomeRecord = {
    id: "out-1",
    kind: "outcome",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confidence: 0.8,
    trust: 0.7,
    tags: [],
    sourceRefs: [],
    actionId: "act-1",
    observedResult: "success",
    discrepancyScore: 0,
    stateDelta: { note: "completed cleanly" },
  };

  orchestrator.appendOutcome(outcome);

  const listed = orchestrator.outcomes.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.observedResult, "success");
  assert.equal(listed[0]?.actionId, "act-1");
});

test("outcome buffer consume removes matched records", () => {
  const orchestrator = new MemoryOrchestrator();

  const mk = (id: string, result: OutcomeRecord["observedResult"]): OutcomeRecord => ({
    id,
    kind: "outcome",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confidence: 0.7,
    trust: 0.7,
    tags: [],
    sourceRefs: [],
    actionId: id,
    observedResult: result,
    discrepancyScore: result === "failure" ? 0.5 : 0,
    stateDelta: {},
  });

  orchestrator.appendOutcome(mk("out-a", "success"));
  orchestrator.appendOutcome(mk("out-b", "failure"));
  orchestrator.appendOutcome(mk("out-c", "success"));

  const failures = orchestrator.outcomes.consume((r) => r.observedResult === "failure");
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.id, "out-b");

  // Remaining: only successes
  assert.equal(orchestrator.outcomes.list().length, 2);
});

// ---------------------------------------------------------------------------
// Thread-linked recall
// ---------------------------------------------------------------------------

test("orchestrator recall surfaces thread by cue match", () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.threads.upsert({
    id: "thread-disk",
    kind: "thread",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confidence: 0.85,
    trust: 0.85,
    tags: [],
    sourceRefs: [],
    title: "Disk pressure monitoring",
    horizon: "short_term",
    status: "active",
    summary: "Track disk usage above warning threshold",
    linkedGoalIds: [],
    linkedMemoryIds: [],
  });

  const result = orchestrator.recall({
    cue: "disk pressure",
    activeThreadIds: [],
    maxItems: 8,
  });

  assert.ok(result.threads.length > 0, "expected thread to be recalled by cue");
  assert.equal(result.threads[0]?.id, "thread-disk");
});

test("orchestrator recall surfaces thread by active thread ID even without cue match", () => {
  const orchestrator = new MemoryOrchestrator();

  orchestrator.threads.upsert({
    id: "thread-xyz",
    kind: "thread",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confidence: 0.7,
    trust: 0.7,
    tags: [],
    sourceRefs: [],
    title: "Unrelated background task",
    horizon: "long_term",
    status: "warm",
    summary: "Something completely unrelated to the cue",
    linkedGoalIds: [],
    linkedMemoryIds: [],
  });

  const result = orchestrator.recall({
    cue: "cpu spike", // no overlap with thread title/summary
    activeThreadIds: ["thread-xyz"], // but explicitly active
    maxItems: 8,
  });

  assert.ok(
    result.threads.some((t) => t.id === "thread-xyz"),
    "expected active thread to be included regardless of cue mismatch"
  );
});

// ---------------------------------------------------------------------------
// Shared WorkingMemory injection — single working-memory truth
// ---------------------------------------------------------------------------

test("orchestrator and Phase1Memory share a single WorkingMemory when injected", () => {

  const phase1 = new Phase1Memory();
  // Inject phase1.working so orchestrator writes go to the same instance
  const orch = new MemoryOrchestrator(phase1.working);

  // Write via orchestrator's direct helper
  orch.writeWorking({
    id: "shared-wk-1",
    kind: "shared_event",
    value: "memory unification proof",
    priority: 0.8,
    expiresAt: Date.now() + 60_000,
  });

  // The item must be visible through phase1.working (same instance)
  const found = phase1.working.get("shared-wk-1");
  assert.ok(found, "orchestrator write must be visible through phase1.working");
  assert.equal(found?.value, "memory unification proof");

  // And the orchestrator's own helpers must agree
  assert.ok(orch.listWorking().some((x) => x.id === "shared-wk-1"));
});

test("orchestrator encode routing to working writes into shared Phase1Memory working store", () => {

  const phase1 = new Phase1Memory();
  const orch = new MemoryOrchestrator(phase1.working);

  // Salience that routes to "working": total ≥ 1.2 < 2.2, impact < 0.7, urgency < 0.7, no exactKey
  orch.encode({
    id: "routed-wk-1",
    text: "memory route test signal",
    salience: { novelty: 0.2, impact: 0.3, goalRelevance: 0.3, recurrence: 0.2, trust: 0.5, urgency: 0.3 },
    timestamp: Date.now(),
  });

  // Phase1Memory's working store should contain the item written by the orchestrator
  const items = phase1.working.list();
  assert.ok(
    items.some((x) => x.id === "routed-wk-1"),
    "encode-routed working item must appear in phase1.working"
  );
});

test("standalone orchestrator (no injection) owns its own WorkingMemory", () => {

  const phase1 = new Phase1Memory();
  const standalone = new MemoryOrchestrator(); // no injection

  standalone.writeWorking({
    id: "isolated-wk-1",
    kind: "isolated",
    value: "should not appear in phase1",
    priority: 0.5,
    expiresAt: Date.now() + 60_000,
  });

  // Must NOT appear in phase1.working (separate instances)
  assert.equal(phase1.working.get("isolated-wk-1"), undefined,
    "standalone orchestrator must not share phase1 working memory");

  // Must appear in standalone orchestrator
  assert.ok(standalone.listWorking().some((x) => x.id === "isolated-wk-1"),
    "item must be in standalone orchestrator's own store");
});
