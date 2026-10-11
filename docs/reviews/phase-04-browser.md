# Phase 04 browser checks

Checked on 11 October 2026 at `/preview` in Chrome. The page viewport was
1470 by 718 pixels, with a 990 pixel wide map column.

The browser check found two failures that terminal checks did not cover.
React Flow disabled pointer events because dragging and its built in selection
were disabled, preventing the custom buttons from receiving clicks. Fixed by
explicitly enabling pointer events on the custom nodes. Controlled node updates
also discarded measured dimensions, preventing reliable initial fitting and
refitting. Fixed by retaining the layout's exact fixed dimensions and waiting
for viewport initialization.

After those fixes, checked opening and closing the six file `categorize` folder.
Its six file rows appeared inside one bordered panel with file count, fan in
and fan out. Sixteen drawn connections terminated on its row handles. Selecting
`config.ts` highlighted it and dimmed unrelated rows and nodes. Closing the
header removed the rows and restored the folded node.

Opening reduced zoom from 0.555440 to 0.513656. The 26 file `src` folder showed
twelve rows plus `14 more files`, and its entire panel remained inside the map.
The detail column remained empty.

Acceptance check 4 passes after the fixes. Check 5 fails: although the initial
fit now contains every node, labels at this window size are too small to read
comfortably without zooming. Phase 04 is not complete. The next change needs to
make the layout compact enough to retain readable labels at the initial fit.

Evidence: [open panel](phase-04-panel.jpg).
