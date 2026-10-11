# Canvas preview

Open `/preview`. The canvas uses the checked in parser result from
`reduxjs/redux-toolkit`, commit `0fd611cc79d44990ac9a040dec4d5cb446233440`,
with `packages/toolkit` as its root. This is the core package, including its
tests and scripts. The rest of the repository is outside this preview's scope.
Parsing the whole repository failed because an Expo example needs the absent
`expo/tsconfig.base` config. No configs or parser rules were changed to hide that.

The JSON is the original parser output. Its TypeScript wrapper validates the
parser contract before passing the data to the interface. No repository fetch,
database query or AI call runs when you open the preview.

To reproduce the fixture with Node 24:

```sh
git clone https://github.com/reduxjs/redux-toolkit.git /tmp/cartograph-redux-toolkit
git -C /tmp/cartograph-redux-toolkit checkout 0fd611cc79d44990ac9a040dec4d5cb446233440
pnpm parse /tmp/cartograph-redux-toolkit/packages/toolkit --output lib/fixtures/redux-toolkit.json
pnpm verify:canvas
```

The terminal verification checks file conservation, singleton counts, endpoint
existence, row handles for every folder expansion, input order independence,
deterministic layout, selection neighbours and heights derived from fan in.
Browser acceptance remains manual.

Folding starts at two files and retries from the original file list with a
higher threshold only when needed. Each depth's merge decisions read one
snapshot. Folder fan in counts distinct files outside the folder importing
its members. Fan out counts distinct external targets. Internal dependencies
appear when the folder opens.

Panels scroll through every file within a fixed viewport of at most twelve rows.
Their fixed header and labelled above and below points stay in place. Connections
to fully visible files terminate on row handles; the rest terminate on the
appropriate summary point. Scrolling preserves selection, node dimensions,
positions and map zoom. No file is discarded. Paths
are shortened only when the suffix is unique among visible labels; full paths
remain in tooltips. Opening and closing refit the updated layout with the
current zoom as the maximum, so refitting cannot zoom in.

The layout uses Dagre for dependency columns and ordering. React Flow draws
its own edges, so the final layout compacts the vertical space Dagre reserved
for edge routing. Columns retain their order, nodes keep their calculated
sizes, and a fresh expansion is packed without overlaps. Initial fitting uses
four percent padding to keep labels readable while retaining the entire map.
