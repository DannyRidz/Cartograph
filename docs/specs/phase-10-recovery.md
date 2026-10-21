# Phase 10 supplement: abandoned run recovery

## Summary

A live analysis records activity every 30 seconds. Re-analyse may replace an
unfinished run only after five minutes without activity. Slow runs stay active
while they keep reporting, and expired workers cannot publish a completed map.

## Context

Re-analysis currently returns any unfinished run forever, even if its process
has stopped. A cutoff measured only from stage changes can interrupt a healthy
run during lengthy classification. The user approved heartbeat based recovery
on 21 October 2026.

## Requirements

- AC-1: A run records activity every 30 seconds using its authenticated identity.
- AC-2: Re-analyse reuses a live run and replaces an expired run atomically.
- AC-3: An expired or replaced worker cannot renew, advance or complete its run.
- AC-4: Another organization cannot renew, replace or inspect the run.
- AC-5: Existing private progress subscriptions receive activity without polling.
- AC-6: Lost heartbeat access stops further classification dispatch and is visible
  as a failed run when failure persistence remains available.

## Decision

Keep the existing analysis identity, organization policies, progress stream and
five minute stale threshold. Use the existing last update time as the activity
timestamp. Record heartbeats every 30 seconds without overlapping requests.
Do not introduce a queue, database polling, new provider or automatic retry.

## Options considered

A fixed cutoff from the last stage change cannot distinguish lengthy work from
abandoned work. Deferring recovery leaves Re-analyse blocked forever. Recording
ongoing activity supports safe replacement with the current execution model.

## Rationale

The run ID already distinguishes the old worker from a replacement. Transactional
state checks fence the old ID after expiry; no additional ownership token is
needed because each new execution receives a new run ID.

## Feature design

Database time determines freshness. A run expires when its last update is more
than five minutes old. A heartbeat only updates a nonseed unfinished run whose
lease has not expired. The first heartbeat must succeed before repository work.

Re-analyse locks the project operation as it does today, marks expired active
runs failed with their previous stage and an abandonment message, then creates a
replacement. Concurrent replacement requests reuse that new active run. Ordinary
submissions continue to reuse the latest existing analysis.

Heartbeat and replacement updates serialize on the analysis row. Stage advancement
and result storage reject expired runs in the database. Heartbeat failure aborts
model requests and prevents new classification work; temporary files remain until
all in-flight work settles. Heartbeats stop and settle before final storage.

Private progress events carry the current stage and message on activity updates.
The existing browser receipt time and reconnect snapshot keep stale detection
current. The stale notice refers to activity, rather than stage changes.

| Value | Source |
| --- | --- |
| Heartbeat interval | User approved 30 seconds |
| Expiry threshold | User approved five minutes, matching existing stale detection |
| Last activity | Existing analysis update timestamp, written by database time |
| Worker identity | Existing analysis ID returned when a run is created |
| Ownership | Existing Clerk organization claim enforced by RLS |
| Abandonment stage | The expired row's stored stage |

## Build plan

1. Add authenticated heartbeat and transactional expiry guards, AC-1 through AC-4.
2. Renew activity during execution and abort on lease loss, AC-1, AC-3, AC-6.
3. Publish activity through existing private subscriptions, AC-5.
4. Verify renewal, expiry, replacement deduplication, old worker rejection and
   tenant isolation using terminal checks and rolled back database transactions.

## Consequences

Database writes occur every 30 seconds while work is active. No database reads
run on a timer. A process unable to report for five minutes loses its lease,
including a process blocked for that long; it must not resume and store results.
Previously abandoned runs become replaceable only when Re-analyse is requested.

## Acceptance check

Keep a long run open and confirm it does not become stale while reporting.
Stop its process, wait more than five minutes, then choose Re-analyse from a
previous map. A new run starts, and the abandoned run remains visible as failed.
