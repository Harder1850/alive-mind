import test from "node:test";
import assert from "node:assert/strict";

import { Phase1Memory } from "../src/memory/phase1-memory";

test("encodes one event into multiple stores", () => {
  const memory = new Phase1Memory();
  memory.encode({
    id: "evt-1",
    cue: "runtime route mismatch",
    entities: ["runtime", "router"],
    context: ["triage", "routing"],
    salience: 0.85,
    confidence: 0.8,
    uncertainty: 0.2,
    exactFacts: [{ key: "runtime.mode", value: "alert", confidence: 0.9 }],
    traits: [{ id: "node-runtime", type: "module", traits: { area: "routing" } }],
    time: Date.now(),
  });

  const snap = memory.snapshot();
  assert.ok(snap.working.length > 0);
  assert.ok(snap.episodes.length > 0);
  assert.ok(snap.structuralNodes.length > 0);
  assert.ok(snap.referenceHot.length > 0);
  assert.ok(snap.associations.length > 0);
});

test("recalls from working memory", () => {
  const memory = new Phase1Memory();
  memory.encode({ id: "evt-2", cue: "disk pressure warning", salience: 0.7, confidence: 0.8, uncertainty: 0.2 });

  const items = memory.recall({ cue: "disk" });
  assert.ok(items.some((x) => x.source === "working"));
});

test("recalls from episodic context", () => {
  const memory = new Phase1Memory();
  memory.encode({
    id: "evt-3",
    cue: "filesystem update",
    context: ["project", "workspace"],
    salience: 0.65,
    confidence: 0.7,
    uncertainty: 0.3,
  });

  const items = memory.recall({ cue: "workspace", context: ["project"] });
  assert.ok(items.some((x) => x.source === "episodic"));
});

test("retrieves exact reference fact", () => {
  const memory = new Phase1Memory();
  memory.encode({
    id: "evt-4",
    cue: "exact fact",
    exactFacts: [{ key: "contracts.signal.version", value: "phase1", confidence: 0.95 }],
    salience: 0.6,
    confidence: 0.9,
    uncertainty: 0.1,
  });

  const items = memory.recall({ cue: "contracts.signal.version", precisionNeed: "high" });
  assert.ok(items.some((x) => x.source === "reference"));
});

test("associative expansion returns linked nodes", () => {
  const memory = new Phase1Memory();
  memory.encode({
    id: "evt-5",
    cue: "runtime deep cognition open",
    entities: ["runtime", "mind", "triage"],
    context: ["phase1"],
    salience: 0.8,
    confidence: 0.8,
    uncertainty: 0.2,
  });

  const items = memory.recall({ cue: "runtime", context: ["phase1"] });
  assert.ok(items.some((x) => x.source === "associative"));
});
