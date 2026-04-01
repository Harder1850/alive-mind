# ALIVE Mind Authority

## Boundary rules

1. Mind performs cognition only.
2. Runtime owns admission, routing, enforcement, and execution authorization.
3. Body owns sensing and execution only.
4. Interface is relay and presentation only.
5. Constitution is external law and root of trust.
6. Mind has no direct world-execution authority.
7. No hidden cross-repo authority leakage is allowed.

## Implementation guardrails

- Keep imports aligned with repo boundaries.
- Preserve working cognition logic before refactors.
- Use wrappers/re-exports during migration to avoid breaking callers.
