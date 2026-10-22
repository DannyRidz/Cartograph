# Two-minute walkthrough

This is a recording script, not a completed video. You can record the existing local preview and show the saved Ask screenshot without making new model calls. The narration is approximately two minutes at a conversational pace.

## Recording sequence

| Time | What to show | Narration |
| --- | --- | --- |
| 0:00–0:15 | Landing page, `images/landing.jpg` | “Cartograph helps a developer understand an unfamiliar codebase. It maps what files import, what depends on them, and where a change might propagate. The key rule is that the map comes from parsing code, rather than asking AI to guess the structure.” |
| 0:15–0:40 | Local `/preview`, or `images/dependency-map.jpg` | “Here is a saved analysis of Redux Toolkit. It contains 226 parsed files, grouped into folders so the map stays readable. Each line represents a resolved import. Coverage stays visible too: skipped files and unresolved imports are reported rather than hidden.” |
| 0:40–1:00 | Select `src/query/core/apiState.ts` from the repository overview, or show `images/file-structure.jpg` | “Selecting a file shows what it imports and which files import it. This file has four direct dependencies and 18 direct dependents. I can follow those paths or calculate reachability across two import levels. That shows possible structural impact, without claiming the application will necessarily break.” |
| 1:00–1:25 | Existing Ask screenshot, `../reviews/phase-12-ask.jpg`. Display the caption “Recorded agent session, separate repository.” | “The application also has an Ask pane. This is a recorded session on a separate repository. The agent performs visible lookups before answering, and its answers link to real files. Its traversal tools use the same graph calculations as the canvas, so there is one definition of a dependency walk.” |
| 1:25–1:45 | Showcase engineering decisions table, then the evaluation documentation | “The stack includes Next.js, TypeScript, Clerk, Supabase, and Managed Deep Agents. Organization access is enforced through database policies. Explanation calls are cached and can be traced with LangSmith. Recorded agent answers are checked against an independent parser snapshot, including whether named files exist and whether unsupported quality questions are refused.” |
| 1:45–2:00 | Return to the dependency map | “This project brings together static analysis, an interactive frontend, team access, and grounded AI. The repository includes setup instructions, phase specifications, and evaluation evidence. The full application runs locally, while these recorded examples make the project available to review without consuming API credits.” |

## Capture notes

For the lowest-effort version, record the screenshot walkthrough in this folder and read the narration. For a version with interaction, open `http://localhost:3000/preview` with the local app running. Start with a fresh page, show the overview, then click `src/query/core/apiState.ts 18` in “Most depended on.” Expand its folder or follow a dependent if useful. These map actions use saved data.

For the Ask segment, open the saved image and keep the “recorded session” caption visible. The current preview has no saved chat replay; do not present its Ask pane as an offline agent demo. Do not submit a repository URL, click Explain, re-analyse, or send an Ask question during this recording. Those belong to the live service paths and can incur costs.

Record only the browser content or the images, with unrelated tabs, notifications, terminals, and account menus out of frame. A normal microphone narration is enough; no paid editing or AI voice service is required. If a live demonstration fails during an interview, use the saved captures and describe the limitation directly.

Suggested title: **Cartograph | Codebase dependency maps and grounded AI**.

Suggested description: “A walkthrough of Cartograph, a TypeScript and JavaScript repository explorer. Demonstrates parser-derived dependency maps, file relationships, and a recorded agent lookup session. The map uses saved parser output; the Ask segment is a recorded example. Source, setup, and evaluation evidence: https://github.com/DannyRidz/Cartograph.”
