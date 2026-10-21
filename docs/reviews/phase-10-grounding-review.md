# Review, phase-10-grounding, 2026-10-21

**Reviewed by**: independent review agent (separate from the authoring agent)
**Scope**: 4 files, uncommitted
**Verdict**: Approve

## Summary

The change moves dependency prose into deterministic rendering from parser edges, separates folder edge boundaries correctly, validates exact folder membership, and invalidates only explanation caches when the prompt or schema changes. The reviewed explicit relationship vocabulary now fails in file overviews, folder overviews, and member summaries before cache insertion. This is intentionally a conservative fail-closed vocabulary guard: a matching model response becomes a visible error, rather than claiming arbitrary source prose has been semantically proven relationship-free.

## Strengths

- Folder internal, incoming, and outgoing edges are derived only from resolved parser edges, including the `index.js` to `index.d.ts` resolution case.
- Exact member validation rejects missing, duplicated, and unknown folder members before cache insertion; prompt and schema content participate in explanation cache keys without changing role keys.
- Parser-written paths remain the only rendered dependency statements, while the prompt steers source summaries toward direct local-behaviour verbs that the validator accepts.

## Test coverage

This project deliberately uses terminal verification rather than a test runner. `scripts/verify-ai.ts` passed under Node 24 and covers traced cache hits, prompt invalidation, parser edge boundaries, exact members, filename-free relationship vocabulary across every summary location, and cache non-insertion for invalid summaries. The previously accepted `required` inflection was also reproduced directly and now fails with the intended visible error.
