# alive-mind — Migration Notes

Code-level audit and migration recommendation.
Status: current as of Backbone Freeze sprint.

---

## Migration categories

| Category | Meaning |
|---|---|
| **PRESERVE AS-IS** | Code is correct, stable, and in its right place. Do not touch. |
| **WRAP** | Logic is sound but needs an interface/port layer added around it before it can evolve safely. |
| **SPLIT LATER** | Currently one file does two separable things. Splitting is safe but not urgent. |
| **MOVE NOW** | Stub or structural mismatch — new location has been created and is ready. |
| **REPLACED** | Old implementation removed or superseded by new module. |

---

## src/spine/

| File | Category | Notes |
|---|---|---|
| `phase1-cognition-loop.ts` | **PRESERVE AS-IS** | Main live loop, well-tested, 48 tests pass. Do not refactor. |
| `mind-loop.ts` | **PRESERVE AS-IS** | Thin wrapper over synthesize → Decision. Used by runtime bridge. |
| `state-model.ts` | **PRESERVE AS-IS** | ASMState type used by reasoning-engine and llm-teacher. |
| `conscious-buffer.ts` | **PRESERVE AS-IS** | Used by mind-loop. |
| `attention-buffer.ts` | **PRESERVE AS-IS** | Used by mind-loop. |

---

## src/memory/

| File | Category | Notes |
|---|---|---|
| `phase1-memory.ts` | **PRESERVE AS-IS** | Clean multi-store facade. referenceStore sharing pattern is correct. |
| `memory-orchestrator.ts` | **PRESERVE AS-IS** | Injection pattern (shared WorkingMemory, shared ReferenceStore) is correct. |
| `working-memory.ts` | **PRESERVE AS-IS** | TTL-aware ring buffer. Correct and well-tested. |
| `outcome-buffer.ts` | **PRESERVE AS-IS** | Clean bounded buffer. Correct. |
| `reference-store.ts` | **PRESERVE AS-IS** | Simple key-value store. Correct. |
| `thread-store.ts` | **PRESERVE AS-IS** | Clean, correct. |
| `types.ts` | **PRESERVE AS-IS** | Authoritative schema for all 8 memory kinds. |
| `memory-types.ts` | **PRESERVE AS-IS** | MemoryEvent, RecallRequest, RecallCandidate shapes. |
| `encoding-engine.ts` | **PRESERVE AS-IS** | Salience routing is sound. |
| `retrieval-policy.ts` | **PRESERVE AS-IS** | Budget allocation logic is correct and tested. |
| `recall-engine.ts` | **PRESERVE AS-IS** | Multi-store recall with score-weighted sorting. |
| `reference-adapter.ts` | **PRESERVE AS-IS** | Bridge for backward compat — needed because TypeScript private fields require extends. |
| `reference-memory.ts` | **PRESERVE AS-IS** | Base class for the adapter pattern. |
| `contradiction-store.ts` | **PRESERVE AS-IS** | Time-decay suppression is correct and tested. Critical for CCE. |
| `rule-store.ts` | **PRESERVE AS-IS** | Seeded rules work. Three Slice 1 rules (cpu_high, disk_low, file_change) are correct. |
| `memory-encoder.ts` | **SPLIT LATER** | Could be split from memory-recall.ts. Not urgent — only two callers. |
| `memory-recall.ts` | **SPLIT LATER** | See above. |
| `associative-graph.ts` | **PRESERVE AS-IS** | Used by Phase1Memory. |
| `episodic-memory.ts` | **PRESERVE AS-IS** | Used by Phase1Memory. |
| `structural-memory.ts` | **PRESERVE AS-IS** | Used by Phase1Memory. |
| `derived-memory.ts` | **PRESERVE AS-IS** | Used by reasoning-engine. Reads stories.json (OK — read-only). |
| `story-engine.ts`, `symbol-engine.ts`, etc. | **PRESERVE AS-IS** | Supporting modules. Do not modify. |

---

## src/decisions/

| File | Category | Notes |
|---|---|---|
| `synthesize.ts` | **PRESERVE AS-IS** | Tiered hierarchy (procedure→rule→episode→semantic→LLM→fallback) is correct. SVE+CCE+ARE wired. |
| `reasoning-engine.ts` | **WRAP** | Sound logic (sensor deduction, ULP, cross-domain). Needs interface injection for the STM push (`stm.push(signal)`) — currently calls module singleton directly. Not urgent for Slice 1. |
| `llm-teacher.ts` | **WRAP** | STEWARD DIRECTIVE in system prompt authorizes autonomous emergency file writes without runtime approval. This violates `MIND_CANNOT_EXECUTE`. Wrap with a safety gate before using in any production path that could trigger the teacher. The `askTeacher` function itself is safe (returns Action, does not execute) but the system prompt must be reviewed. |
| `action-generator.ts` | **MOVE NOW** | Empty stub. Superseded by `src/candidates/candidate-generator.ts`. Delete stub when safe. |
| `transition-predictor.ts` | **MOVE NOW** | Empty stub. Superseded by `src/simulation/simulation-engine.ts`. |
| `cost-risk-uncertainty.ts` | **MOVE NOW** | Empty file. Superseded by `src/evaluation/evaluation-engine.ts` (risk/confidence scoring). |
| `decision-selector.ts` | **PRESERVE AS-IS** | Used by mind-loop. |
| `value-model.ts` | **PRESERVE AS-IS** | Placeholder — do not delete, referenced by decision-selector. |
| `contradiction-engine.ts` | **PRESERVE AS-IS** | Thin wrapper over contradiction-store. OK. |

---

## src/cognition/

| File | Category | Notes |
|---|---|---|
| `sve.ts` | **PRESERVE AS-IS** | Correct, tested via migration tests. Five checks are sound. |
| `cce.ts` | **PRESERVE AS-IS** | Correct. Suppression integration with contradiction-store is working. |
| `are.ts` | **PRESERVE AS-IS** | Conditional adversarial challenge is correct. Threshold (0.40) may need calibration. |
| `deliberation/deliberation-engine.ts` | **MOVE NOW** | Empty stub. Superseded by `src/evaluation/evaluation-engine.ts`. |
| `inference/inference-engine.ts` | **MOVE NOW** | Empty stub. No current use. |
| `reasoning/reasoner.ts` | **MOVE NOW** | Empty stub. `decisions/reasoning-engine.ts` does the actual reasoning. |
| `self-model/self-model.ts` | **PRESERVE AS-IS** | Returns `{identity: "ALIVE", status: "nominal"}`. Keep as placeholder — identity spine belongs here eventually. |
| `intent/intent-interpreter.ts` | **PRESERVE AS-IS** | NEW — deterministic Tier 1 intent classifier. |

---

## src/learning/

| File | Category | Notes |
|---|---|---|
| `ltg/learning-transfer-gate.ts` | **PRESERVE AS-IS** | Four-condition gate is correct. Slice 4 contradiction injection is hooked via `recentContradictions` set. |
| `reinforcement-decay/reinforcement-engine.ts` | **REPLACED** | Old version used `readFileSync`/`writeFileSync` on `stories.json` — FS side effects in cognition. New version: injected `ReinforcementStore` interface. `InMemoryReinforcementStore` is the default. No FS. Backward-compatible singleton export preserved. |
| `compression/compression-engine.ts` | **REPLACED** | Old stub returned `null`. New version: three strategies (dedup/prune_low/merge_cue), typed input/output, deterministic. |

---

## src/calibration/

| File | Category | Notes |
|---|---|---|
| `confidence.ts` | **REPLACED** | Was `export const confidence = {}`. Superseded by `calibration-surface.ts`. |
| `drift.ts` | **REPLACED** | Was `export const drift = {}`. Superseded by `calibration-surface.ts`. |
| `error-attribution.ts` | **REPLACED** | Was `export const errorAttribution = {}`. Superseded by `calibration-surface.ts`. |
| `threshold-adjustment.ts` | **REPLACED** | Was `export const thresholdAdjustment = {}`. Superseded by `calibration-surface.ts`. |
| `calibration-surface.ts` | **MOVE NOW** | NEW — typed interfaces + placeholder implementations for all four calibration subsystems. |

---

## New modules (NEW in this sprint)

| Path | Purpose |
|---|---|
| `src/interpretation/signal-interpreter.ts` | Pre-cognition signal classification. Extracted from scattered logic in phase1-cognition-loop.ts. |
| `src/candidates/candidate-generator.ts` | Clean port wrapping the synthesize pipeline. Migration target for unified candidate generation. |
| `src/evaluation/evaluation-engine.ts` | Unified SVE→CCE→ARE pipeline. Replaces individual call sites in synthesize.ts. |
| `src/simulation/simulation-engine.ts` | Bounded skeleton for mental simulation. Depth 0 (no-op) and depth 1 (heuristic) implemented. |
| `src/promotion/promotion-policy.ts` | Context-aware LTG wrapper. Adds contradiction pressure injection and batch support. |
| `src/consolidation/consolidation-engine.ts` | Three-stage memory lifecycle pipeline: prune → promote → compress. |
| `src/calibration/calibration-surface.ts` | Typed interfaces for all four calibration subsystems. Placeholder implementations. |

---

## Doctrine-sensitive files — intentionally incomplete

These files have typed interfaces and `TODO(doctrine):` markers but no finalized implementation.
Do not implement formulas in these files until the relevant policy is locked.

| File | Unresolved doctrine |
|---|---|
| `src/calibration/calibration-surface.ts` | `computeCalibrationOffset`: metric (ECE, Platt scaling) not chosen. `detectDrift`: KL divergence vs PSI vs other not chosen. `attributeError`: attribution algorithm not finalized. `suggestThresholdAdjustment`: feedback loop formula not finalized. |
| `src/simulation/simulation-engine.ts` | All depth-1 projection formulas are heuristics only. Depth-2 (multi-step) is stubbed. `projected_outcome` probability arithmetic not finalized. |
| `src/promotion/promotion-policy.ts` | Cooldown duration not finalized. Batch promotion frequency not finalized. How contradiction pressure modifies individual LTG conditions is not specified. Seeded vs injected vs learned trust resolution is unresolved. |
| `src/consolidation/consolidation-engine.ts` | Viability formula (currently static confidence floor). Consolidation cycle frequency. LTM write format. |
| `src/evaluation/evaluation-engine.ts` | Score aggregation formula (`final = CCE.adjusted + ARE.confidence_adj`) is a placeholder. Dominance math (weighing SVE warnings vs CCE penalties) is unresolved. Interruption arbitration thresholds not finalized. |
| `src/decisions/llm-teacher.ts` | STEWARD DIRECTIVE authorizes autonomous emergency writes. This is architecturally unsafe — it bypasses runtime authorization. Must be gated behind a safety wrapper before any live use. |
| `src/learning/ltg/learning-transfer-gate.ts` | `recentContradictions` set is always empty (Slice 4 connector not yet wired). |

---

## What is NOT done (out of scope for this sprint)

- Multi-candidate generation (evaluating all tiers and returning multiple ranked candidates)
- Semantic similarity for compression (merge_cue uses prefix matching only)
- Calibration formula implementation (all four subsystems return zero/placeholder)
- Depth-2 simulation (multi-step cascading state change projection)
- LLM Teacher safety gate (STEWARD DIRECTIVE review)
- Splitting memory-encoder.ts from memory-recall.ts
- Deleting the superseded stubs (action-generator, transition-predictor, cost-risk-uncertainty, deliberation-engine, inference-engine, reasoner)
