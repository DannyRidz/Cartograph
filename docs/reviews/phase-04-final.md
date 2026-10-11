# Phase 04 final verification

Verified on 11 October 2026 in Chrome at `/preview`, with a page viewport of
1470 by 718 pixels and a 990 pixel wide map. This supersedes the earlier
readability failure recorded in the browser and scrolling reports.

The cause was unused vertical space from Dagre's edge routing. React Flow draws
its own curves, so the final layout now retains Dagre's dependency columns and
node ordering but compacts the vertical gaps. Nodes retain their label widths
and heights calculated from fan in. Folding and parser data are unchanged.

The initial fit is now zoom 0.899811 rather than approximately 0.55. All 23 nodes
are inside the map, no nodes overlap, no folder labels are clipped, and labels
are readable without clicking zoom. The graph occupies the map's width rather
than huddling in one corner. The three columns remain in place.

Opened the 44 file `query/tests` folder. Its header showed file count, fan in
and fan out. Opening refit to zoom 0.763310, never zooming in. The entire panel
was visible. Scrolling to its last file changed the above and below summaries
without changing panel position, dimensions or map transform. Selected
`utils.test.ts`: its real outgoing edge and `query/utils` remained bright;
unrelated rows and nodes dimmed. Scrolling back to the top preserved selection
and routed the bright connection through the below point. Clicking the header
closed the panel and kept zoom at 0.763310.

Reloading reproduced the exact initial node positions. The browser recorded no
React Flow warnings or errors. Clerk's existing development key notice remains.

Terminal checks: 226 files, 23 folded nodes, 9.8 files per node, zero singleton
nodes and zero invalid endpoints. Checks cover file conservation, input order
independence, deterministic layout, overlap in each single folder expansion,
row and summary handles through scrolling, selection and fan in heights.

Acceptance checks 1 through 5 pass in the tested desktop viewport.

Evidence: [initial fit](phase-04-readable.jpg) and
[open folder with its last file selected](phase-04-readable-panel.jpg).
