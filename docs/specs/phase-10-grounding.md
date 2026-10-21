# Phase 10 supplement: explanation grounding

The user approved parser written dependency statements on 21 October 2026 after
live p-defer folder explanations repeatedly inferred an implementation dependency
absent from the resolved graph.

## Behaviour

The model receives the complete existing source and neighbour context, but returns
structured source summaries only. The server validates the response before caching
or showing it. Summaries cover local behaviour, never repository relationships or
paths. The application supplies exact member paths and renders all dependency
statements from the parser's edges. Folder internal, incoming and outgoing edges
are computed separately. Literal source imports never add relationships.

A folder has an overview and one summary per member. A file has one overview.
Missing, duplicated or unknown members, repository paths in summary text, and
explicit dependency language fail visibly rather than being shown or cached.
Explanations use the existing inline code, bold and bullet renderer. Paths in
parser written statements remain clickable. Prompt and response contract changes
invalidate explanation caches, while role caches retain their current keys.
The pinned model, authorization, tracing and staleness behaviour stay in place.

## Acceptance check

Explain the p-defer root folder: both test imports resolve only to index.d.ts,
with no boundary edges and no claimed edge to index.js. Explain a file with direct
neighbours: its parser supplied path links move the map. Repeat either request:
cache hit, with no model child in its trace. Invalid model summaries fail before
cache insertion. Terminal checks cover missing members, inferred dependencies,
folder boundaries, cache invalidation, types, lint and build.
