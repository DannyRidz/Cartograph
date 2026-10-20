# Phase 9 browser verification

Verified on 20 October 2026 in the signed in Chrome session at localhost:3000.
The user explicitly requested browser verification after implementation.

All three acceptance checks passed. No code changes were needed.

1. Analysed `expressjs/express` at commit `0dee2c52c7c8` through the browser.
   Fetching, parsing, and storage completed. The graph displayed connected
   folders and 141 parsed files. Running the phase 8 parser from commit
   `f748d66` against this same source found zero imports and zero edges.
   Phase 9 found 403 import occurrences and 153 distinct edges.
2. The Express browser result showed 159/165 local imports resolved (96%),
   238 external imports, six unresolved imports, and zero routes. Nonliteral
   calls and missing example dependencies had explicit unresolved reasons.
   Coverage now has a real denominator.
3. Rechecked the captured Cartograph phase 8 source snapshot. Its 149 edges
   remain byte identical before and after the parser change, using
   `JSON.stringify(edges)` equality. This check ran in the terminal.

Also analysed `mdn/express-locallibrary-tutorial` at commit `7887fd813fa8`
through the browser. It detected Express, showed 20 parsed files, 88 imports
seen, 46/46 local imports resolved, 42 external imports, and zero routes.
The category panel showed router, controller, and model roles. Selecting
`controllers/bookController.js` showed four model dependencies and
`routes/catalog.js` as its dependent. Reloading preserved the stored graph,
counts, roles, and empty route table.

Express itself uses the fallback adapter because its manifest does not declare
an Express dependency. The MDN application verifies Express adapter detection.

Browser results:

- [Express](http://localhost:3000/workspace/analyses/20e2b181-d689-4c03-b3bb-b77f48de3746)
- [MDN Express application](http://localhost:3000/workspace/analyses/cf0e16da-ff98-491d-b382-a94eeb96a881)

Screenshots are saved in `output/playwright/phase-09-express-graph.png` and
`output/playwright/phase-09-express-controller.png`.
