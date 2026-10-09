# Phase 2 — Dashboard and schema

**Goal.** The workspace exists, it belongs to one team, and it can prove that.

## Build

- The first migration. Eight tables: projects, analyses, files, edges, routes,
  explanations, file roles, insights. Every one of them owns its rows through a
  foreign key to an organization, and deleting the organization removes them.
- Row-level security on all eight, written as database policy, with the
  predicate reading the organization claim off the auth token.
- The dashboard: the list of analyses belonging to the organization you're
  currently in, what state each one is in, and an empty state for a team that
  has never run one.
- Seeded rows, because nothing creates a real one yet.

## Agreed implementation decisions

Approved on 9 October 2026.

- Add a ninth table, organizations, keyed by the Clerk organization ID. All
  eight tables reference it with cascading deletion. Its own reads also use RLS.
- A verified Clerk organization.deleted webhook deletes the parent row using
  a separate server credential. Only this lifecycle handler bypasses RLS;
  dashboard reads always use the publishable key and the current session token.
  The handler is idempotent, and failed database writes return an error so Clerk
  can retry. Organization creation is seeded for now.
- Each project stores a public GitHub repository URL. Each analysis references
  its project and stores its creation time, state (queued, parsing, completed,
  failed), and whether it is seeded demonstration data. Related rows reference
  the same organization and analysis; constraints prevent references across teams.
- The other six tables hold only their basic record: file path, resolved edge
  endpoints, route method and path, explanation text, file role, or insight text.
  No parser, AI call, or repository analysis is implemented in this phase.
- The existing workspace shell stays in place. Its main panel shows analyses
  with repository URL, state, creation time, and a visible Seeded label.
  An empty team sees an empty state. Loading and query failure have distinct
  states. Reads name columns, return the newest 50 rows, and never poll.
- Seed two actual Clerk organization IDs supplied at seed time, with different
  analysis states. Seed rows are explicitly demonstrations, not parser results.
  Missing or identical IDs fail loudly. No file, edge, or route is fabricated.

## Constraints

- Authorization is a property of the database, not a check the application
  remembers to perform. No table is readable without a policy on it.
- Migrations are files tracked in version control, not changes made by hand in a
  dashboard.
- The dashboard does not filter by organization in application code. If the
  query returned another organization's row, the bug is the policy.
- Switching organization changes what the same page shows, without a different
  query being written for it.

## Acceptance check

1. With analyses seeded for two different organizations: signed in to the
   first, the dashboard lists only that organization's rows. Switch
   organization, the list changes, and no code went looking for a different
   table.
2. Every one of the eight tables has row-level security enabled. Check all
   eight, not a sample.

## Not in this phase

The "analyse a repository" form. There is nothing behind it to call yet, and a
button that does nothing for a long stretch is worse than no button.
