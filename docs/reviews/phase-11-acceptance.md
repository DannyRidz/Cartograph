# Phase 11 acceptance verification

Date: 2026-10-21, Asia/Brunei.

This is the initial verification record. The failures below were subsequently
fixed and rechecked in [phase-11-fixed.md](phase-11-fixed.md).

The requested browser and terminal checks were performed. Phase 11 is not ready
for sign off: the path detector produces false positives, and the dashboard's
aggregate does not agree with the complete stored experiment results.

## Real app traffic

Started the current app with Node 24 and opened the existing completed
`sindresorhus/p-defer` analysis in the authenticated browser session.

1. Selected the root folder and clicked Explain. A cached explanation appeared,
   describing all four members and the two exact parser edges.
2. Selected `index.js` and clicked Explain. A newly generated explanation appeared,
   followed by the parser's statements that there are no incoming or outgoing
   repository imports for that file.
3. Clicked Explain again. The same file explanation appeared with the Cached
   explanation label and a refreshed repository check time.

All three requests produced stored `cartograph.explanation` runs with the exact
allowed paths, served text, cache status, and `invented_paths=1` feedback. This
was checked through the API as well as through the visible app responses.

| Request | Run ID | Cache hit |
| --- | --- | --- |
| Folder | `01a15e1b-4546-7000-8000-0387d3889054` | Yes |
| File | `01a15e1b-d6e6-7000-8000-01f3415bfc60` | No |
| File again | `01a15e1d-21ec-7000-8000-0316857ab2d4` | Yes |

`pnpm eval:paths`, using Node 24, reported **100.00% (3/3)** and exited 0.
`pnpm eval:paths --inject` reported **0.00% (0/3)** and exited 1, as expected.
Each injected failure named exactly `__cartograph_eval_invented__/not-supplied.ts`.
That token was visibly absent from the recorded allowed set for each request.

## Role accuracy

The existing real experiment `cartograph-role-accuracy-3fc0c526` was inspected in
the browser. It shows 42/42 runs and mean `role_accuracy=1.00`. The completed
terminal experiment reported **100% over 42 held out files**.
An API read also confirmed all 42 runs have persisted accuracy feedback of 1.

## Prompt comparison

Both existing experiments were selected through the browser's Add comparison
control and displayed together. The comparison URL requires the two session IDs
in one comma separated `selectedSessions` parameter. The earlier link with two
repeated parameters opened only the retired experiment.

[Open both experiments](https://smith.langchain.com/o/20310bbf-e7f2-44b0-bc44-e32a95eae663/datasets/60ceec55-c0c9-4248-8773-bc45a6a5d59a/compare?selectedSessions=acda2041-e02c-4738-9f41-ba8b2330e52e%2C0546504f-cb1e-48e2-b64b-81f7987f77b3&source=acda2041-e02c-4738-9f41-ba8b2330e52e)

Reading all six root runs in each experiment through the API confirmed:

| Version | Answers accepted | Mean usefulness | Path pass rate |
| --- | --- | --- | --- |
| Retired | 6/6 | 100% | 0% |
| Current | 2/6 | 33.33% | 100% |

Usefulness is subjective model judgment. Current minus retired is **−66.67
percentage points** when computed from all six stored scores. Four current
responses were rejected by the production summary validator and assigned zero
usefulness without a judge call. This measures answer availability as well as
the usefulness of the answers that were served.

The browser dashboard, including after a reload, showed **20%** for current
usefulness and answer availability, rather than the **33.33%** obtained from the
six stored per run scores. The cause of the aggregate discrepancy is unresolved.
The displayed comparison therefore cannot yet be treated as consistent evidence.

## Detector false positives

Inspecting the retired experiment's failed path feedback revealed non-path text
being counted as invented files. Examples include `Next.js`,
`QueryClientContext.Provider`, and `serialization/deserialization`. External
package specifiers present in the supplied source, such as `@tanstack/query-core`,
are also reported as invented paths. Some other failures are actual absent
repository paths, but the current detector does not distinguish these cases.

The fresh live requests and injected filename check pass. The broader experiment
shows that a failing detector score does not reliably mean an invented filename.
The retired experiment's 0% path score must not be presented as proof that every
answer invented a repository file.

## Next work

Correct the detector's treatment of prose, symbols and external package names,
and investigate the dashboard aggregate discrepancy before signing off phase 11.
Review the four rejected current summaries before claiming the current prompt
improves usefulness. This verification changed no application code or prompts.
