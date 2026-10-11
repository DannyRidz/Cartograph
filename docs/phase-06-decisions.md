# Phase 6 rules

Approved in the build conversation on 2026-10-11.

An unusual import count is at least 10 distinct importing files and strictly
above the repository mean plus two population standard deviations. All parsed
files, including those with zero importers, contribute to that calculation.
Files over 500 parsed lines appear in the long files group.

The convention adapter excludes standard Next.js App Router entry files,
Pages Router entries, middleware and proxy, and recognized tool configuration
files from files nothing imports. This exclusion is conservative, it does not
claim those files actually execute. Other zero import files are described only
as having no parsed importers, never as unused.

Each cyclic group shows one actual closed import path and the full group of
mutually reachable files. It does not attempt to enumerate every possible cycle.

Insights start collapsed beneath the structure details. Category selection
takes precedence over selection and hover for dimming, so nonmatching files
remain dimmed. Clicking the active category clears it. Every panel counts its
matching files across the full list, including rows outside its scroll window.

Terminal verification: `pnpm verify:phase-06`, `pnpm verify:canvas`,
`pnpm verify:parser`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
Use Node 22 or newer. The browser acceptance check in the phase spec remains
manual.
