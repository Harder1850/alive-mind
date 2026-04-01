# Current-to-Target Mapping (Pass 1)

## spine/*
- `src/spine/mind-loop.ts` -> wrap into `src/core/mind-loop.ts` and export in `src/public/process-cognition.ts` (wrapped)
- `src/spine/state-model.ts` -> wrap into `src/asm/state-model.ts` (wrapped)
- `src/spine/attention-buffer.ts` -> `src/attention/attention-buffer.ts` (wrapped)
- `src/spine/conscious-buffer.ts` -> `src/working-memory/conscious-buffer.ts` (wrapped)
- `src/spine/phase1-cognition-loop.ts` -> `src/core/phase1-cognition-loop.ts` (wrapped, preserve)

## memory/*
- Preserve current files as working core.
- Add category wrappers under `src/memory/{orchestrator,episodic,semantic,reference,procedural,contradiction,causal,narrative,association,outcome}`.
- Files likely split later: `phase1-memory.ts`, `memory-orchestrator.ts`, `derived-memory.ts`, `memory-recall.ts`.
- Deprecated later candidates: duplicate emitted js/d.ts siblings in `src/` (build artifacts tracked in source tree).

## decisions/*
- `synthesize.ts` -> `src/candidates/synthesize.ts` (wrapped)
- `decision-selector.ts`, `reasoning-engine.ts` -> `src/evaluation/*` (wrapped)
- `contradiction-engine.ts`, `cost-risk-uncertainty.ts`, `transition-predictor.ts`, `value-model.ts` -> `src/outcome-evaluation/*` (wrapped)

## calibration/*
- Move by wrapper into `src/self-monitoring/*` and `src/learning/*` where appropriate.
- Keep existing placeholders preserved.

## cognition/*
- Preserve `sve.ts`, `cce.ts`, `are.ts`.
- Wrap into `src/interpretation/sve.ts` and `src/evaluation/{cce,are}.ts`.

## docs/*
- Preserve existing architecture docs.
- Add `docs/architecture`, `docs/specs`, and `docs/build` structured shells.

## tests/*
- Preserve existing tests.
- Add compile-safety scaffolding test for new public/contracts/ingestion surfaces.

## Summary classification
- Preserved as-is: most existing `src/memory/*`, `src/spine/*`, `src/decisions/*`, `src/cognition/*`, `tests/*`.
- Wrapped: spine/memory/decisions/calibration/cognition routes into target folders.
- Split later: broad files that mix multiple target domains.
- Deprecated later: source-tracked transpiled artifacts (`*.js`, `*.d.ts`, maps) once cleanup phase is approved.
