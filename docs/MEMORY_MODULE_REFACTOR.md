# MEMORY MODULE REFACTOR (Additive)

## What was added

New additive files in `src/memory/`:

- `types.ts`
- `encoding-engine.ts`
- `recall-engine.ts`
- `reference-store.ts`
- `thread-store.ts`
- `retrieval-policy.ts`
- `outcome-buffer.ts`
- `memory-orchestrator.ts`
- `index.ts` (barrel export for new module)

New tests:

- `tests/memory-refactor.test.ts`

Entry export surface update:

- `src/index.ts` now exports `MemoryRefactor` namespace as an additive integration surface.

## Old vs new (current state)

### Existing (unchanged)

- Existing episode/procedure/derived memory flows remain active.
- No existing `think` path was replaced.
- Existing `memory/stories.json` + derived-memory retrieval remains untouched.

### New (additive)

- Explicit memory record kinds and typed contracts for:
  - reference / working / episode / semantic / procedure / thread / contradiction / outcome
- Encoding decision function (`chooseEncodingTarget`) for low-risk classification.
- Bounded top-N recall function (`recallTop`) with thread + contradiction considerations.
- Dedicated stores for reference and thread memory.
- Outcome buffer with fixed-capacity trimming.
- Lightweight orchestrator that composes these pieces without side effects.

## What should migrate next

1. Add adapter wiring from current episode/procedure stores into `MemoryOrchestrator`.
2. Introduce semantic/procedure population paths from current reasoning and consolidator layers.
3. Incrementally route retrieval consumers through `recallTop` policy outputs.
4. Add contradiction ingestion adapter from existing contradiction store.
5. Expand tests into integration tests that exercise old+new side-by-side behavior.

## Assumptions

- Additive-first integration is preferred over replacing current memory paths.
- No DB/external state dependency should be introduced.
- Current cognitive loop contracts must remain stable while migration proceeds.

## Unresolved migration points

- New orchestrator is not yet the authoritative runtime memory path.
- Retrieval policy budgets are defined but not yet enforced by runtime callers.
- Existing memory modules do not yet emit all record kinds into the new stores.
