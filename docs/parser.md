# Standalone repository parser

Use Node 24.15.0 from `.nvmrc`, then run:

```sh
pnpm parse . --output /private/tmp/cartograph.json
pnpm verify:parser
```

The parser takes any directory on disk. It does not fetch or clone repositories,
start the app, or read environment values. `parseRepository` is exported from
`lib/parser/parse.ts`. The command prints counts, every skipped file, excluded
directories, and every failed or excluded import. A requested output file is
written and read back through the contract validator before the command succeeds.

## Selection and coverage

The walk keeps complete directories. It parses `.ts`, `.tsx`, `.mts`, `.cts`,
`.js`, `.jsx`, `.mjs`, and `.cjs`, including declaration files. Other files,
symbolic links, unreadable files, and files with syntax errors have individual
skip records. Folder paths retain every level, with `.` representing the root.

Dependency, generated output, and metadata directories are excluded as whole
directories: `.git`, `node_modules`, `.next`, `.turbo`, `.vercel`, `.pnpm-store`,
`dist`, `build`, `out`, and `coverage`. They have separate exclusion records.
Their contents are not visited and are not included in `filesFound`.
Within the visited tree, `filesFound = filesParsed + filesSkipped`.

Resolution uses each source file's nearest `tsconfig.json` or `jsconfig.json`,
including inherited options and aliases. Config errors fail the command.
Without a config, TypeScript's bundler resolution is used. Files are selected
by the walk, independently of config include and exclude lists.

Each import declaration, export declaration with a module specifier, and dynamic
import gets a coverage record with its source line. Only a literal string in a
dynamic import can resolve. `require()` is outside phase 03. Exact asset paths
can be reported as excluded files, but never become source nodes. Packages
resolved in `node_modules`, declared dependencies absent from disk, and Node
builtins are external. Unknown specifiers remain unresolved with a reason.

## Data contract

`RepositoryResult` in `lib/parser/types.ts` defines JSON schema version 1.
`readRepositoryResult` in `lib/parser/data.ts` validates unknown JSON before
returning that type. It also checks coverage counts, edge endpoints, duplicate
edges, resolved import correspondence, and fan counts. An unknown version fails.

Files carry a repository relative path, complete parent folder, adapter module,
module or script kind, line count, SHA256 content hash, and fan counts. A trailing
newline does not add an empty line. Empty files have zero lines. The fallback
adapter uses the containing folder as the module and the TypeScript parser's
module detection as the kind. It knows no framework conventions.

Edges retain the import, re-export, or dynamic import kind. Duplicate edges with
the same source, target, and kind collapse. Fan counts count distinct neighbouring
files across all edge kinds. Coverage retains every occurrence before deduplication.

## Phase 03 verification

`pnpm verify:parser` runs disposable disk fixtures without a test runner. It
checks 240 files in 60 complete folders, aliases, all three edge kinds,
deduplication, fan counts, asset and syntax exclusions, and nonliteral failures.
Renaming the single imported target produces exactly one unresolved import:
`local module target could not be resolved`. JSON round trips preserve all data;
invalid versions and inconsistent edge data fail validation.

Cartograph itself yielded 103 files found, 32 parsed, 71 skipped, 10 folders,
32 edges, and 77 import occurrences. Every skip was an unsupported file type
and has its own record. Of the imports, 32 resolved, 38 were external, 3 were
excluded, and 4 were unresolved. The exclusions are two generated declaration
imports and the CSS import. All four unresolved occurrences import `server-only`,
which is not resolvable on disk or declared as a dependency. The parser reports
that fact rather than supplying framework knowledge.

Types and lint passed. Production build initially failed fetching the existing
Google fonts. With network access it reached Turbopack, whose CSS worker failed
to bind a local port (`Operation not permitted`). Production build verification
therefore remains blocked by the execution environment.

The public Microsoft `tsyringe` repository was cloned at commit
`78222334f49265ea2874fac2c73284345c1124d9` and parsed without installing its dependencies.
It yielded 87 files found, 63 parsed, 24 skipped, 10 folders, 184 deduplicated
edges, and 187 import occurrences. All 34 re-exports resolved. Overall, 185
imports resolved, 2 were external, and none were excluded or unresolved.
