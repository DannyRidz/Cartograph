# Folder scrolling verification

Verified in Chrome on 11 October 2026 at `/preview` after updating Phase 04
for bounded, internally scrollable folder panels.

Opened `src/query/tests`, containing 44 files. Its list viewport remained
336 pixels high while the full file list occupied 1232 pixels. Wheel scrolling
inside the panel reached offset 896, exposing the last file, `utils.test.ts`.
The summaries changed from `0 files above` and `32 files below` to
`32 files above` and `0 files below`.

The panel and header bounding rectangles were identical before and after
scrolling. The map transform also stayed unchanged, at zoom 0.494009. Selecting
the last file highlighted its real outgoing edge to `src/query/utils`. The
rendered edge endpoint agreed with the row handle within 0.002 screen pixels.
Scrolling back to the top retained file selection and kept its outgoing edge
on the bright below point. Keyboard navigation also reached rows at the end.

During development, scroll updates initially produced brief missing handle
warnings. Fixed by keeping handle IDs registered and deriving their positions
with the connections. A fresh browser run produced no React Flow warnings or
errors during opening, scrolling or selection. Clerk's existing development
key notice remains.

The terminal verifier exercises the top, partial row, middle and bottom
positions for each folder, checks visible row and summary endpoints, and
checks selected files and their connected endpoints through scrolling.

The earlier initial label readability failure remains. This change completes
folder scrolling, not all of Phase 04.

Evidence: [last file selected](phase-04-scroll.jpg).
