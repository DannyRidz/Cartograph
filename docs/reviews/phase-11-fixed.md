# Phase 11 fixes and final verification

Verified on 2026-10-21, Asia/Brunei. All four phase 11 acceptance checks passed.
This supersedes the failures recorded in `phase-11-acceptance.md`.

## What changed

The path detector distinguishes repository file claims from framework names,
source member symbols, module specifiers and slash separated prose. External
packages are identified by parser outcomes; source syntax confirms references.
Internal aliases containing filenames are not excused as packages. Explicit
file/path labels override non-path reference exclusions. Allowed paths remain an
exact set: no basename expansion, alias normalization, guessed files or edges.

Quoted contractions, grouped filenames, path patterns, JSON summaries, dotfiles,
bracketed routes, spaces and unknown extensions have regression checks. Patterns
are kept intact rather than split into invented fragments. A filename appearing
in a source string never becomes an allowed file. Source reference evidence is
recorded on live traces, including cache hits. Stale explanations verify source
at the analysed commit before deriving that evidence.

Batched prediction trace uploads could race evaluator feedback writes. Each
evaluator now flushes prediction traces before returning feedback. Experiment
completion requires every expected root run, every per run score, and aggregate
counts and means to agree. A bounded two minute reconciliation wait fails loudly
if results remain incomplete. `pnpm eval:results` can recheck the same stored
experiments without new model calls. Progress metadata now includes the literal
`invented_paths` metric key. Comparison links use one comma separated parameter.

The current prompt states the existing vocabulary restrictions explicitly. The
app and evaluation share generation, schema validation, rendering and one bounded
correction attempt. The correction receives the unchanged source facts and exact
validation failure. The validator was not relaxed. A second invalid response or
an infrastructure failure still fails visibly. Prompt/generation changes invalidate
the application's explanation cache. Every completion retains a traced cache read.

## Acceptance results

| Check | Result |
| --- | --- |
| Recent real explanation path checks | 100%, 6/6, exit 0 |
| Guaranteed absent filename injection | Caught 6/6, 0% path pass rate, expected exit 1 |
| Held out conventional roles | 100%, 42/42 distinct files |
| Current explanations accepted | 6/6 |
| Current explanation path pass rate | 100%, 6/6 |
| Retired explanation path pass rate | 66.67%, 4/6 |
| Subjective usefulness, both versions | 100%; current minus retired 0 percentage points |

Browser verification covered a new complete folder explanation, a new file
explanation, and a subsequent file cache hit in the real `sindresorhus/p-defer`
analysis. The newest three live trace IDs were:

- `01a15e34-2bd2-7000-8000-005211320979`, folder, new answer.
- `01a15e38-cb35-7000-8000-00aa5adc1a72`, file, new answer.
- `01a15e44-35d3-7000-8000-02ce67415acd`, file, cache hit.

All six recent live runs had stored passing feedback; all six injected variants
named exactly `__cartograph_eval_invented__/not-supplied.ts`, absent from their
allowed path lists. Injection changed neither stored explanations nor feedback.

The latest role experiment is `cartograph-role-accuracy-3727e956`. All 42 stored
scores and its dashboard aggregate agree. The final comparison experiments are
`cartograph-explanation-retired-2e23f21e` and
`cartograph-explanation-current-eb648916`. All six per run scores for every metric
and their aggregates agree. Path scores were also recomputed with the final code.

[Open the verified comparison](https://smith.langchain.com/o/20310bbf-e7f2-44b0-bc44-e32a95eae663/datasets/cd74f656-a5d7-4404-b247-1544e784c135/compare?selectedSessions=1df47684-c582-451e-b0a5-e14d9119d3f0%2Cdba20fd2-89b8-41e3-be19-ac006aee5ca3)

The two remaining retired failures are genuine exact-set violations: one answer
shortens `src/QueryClientProvider.tsx` to `QueryClientProvider.tsx`; another names
root config paths and source patterns absent from its four supplied paths. They
no longer flag `Next.js`, source property names, packages or prose as filenames.
The current version improves path pass rate by 33.33 percentage points on this
dataset; usefulness is tied. Usefulness is a subjective model judgment, not an
exact guarantee, and the comparison contains only six selections.

## Terminal verification

Node 24 was used. Types, lint and production build passed, along with
`verify:evals`, `verify:ai`, `verify:ai-review` and `verify:explanation-prose`.
The existing parser dynamic filesystem tracing warning remains in the build.
No check was weakened, no package or browser driver was installed, and no work
from a later phase was added.
