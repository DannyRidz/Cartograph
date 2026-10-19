# Local setup

## Node

Use `nvm use` to select the Node 24 version in `.nvmrc`. The Supabase client
requires Node 22 or newer for native WebSocket support, including when the
client is constructed without subscribing to Realtime.

## Environment

Set these in `.env.local` at the repository root:

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Use the publishable Supabase key, never a secret or service role key. Missing or
blank values stop both the build and server startup with the variable name.
The Supabase URL must use HTTP or HTTPS.

The app uses `/sign-in` and `/sign-up`. Both sign in and sign up finish at
`/workspace`, regardless of the enabled sign in method.

## Clerk configuration

In [Organizations settings](https://dashboard.clerk.com/last-active?path=organizations-settings),
enable Organizations with **Membership required** (Personal Accounts disabled),
then enable **Create first organization automatically** and **Default naming
rules**. Leave the default Admin and Member roles in place. Clerk provisions
the first organization during authentication, so the application does not
create organizations or look them up during server rendering.

Enable Email in Clerk authentication settings so organization invitation emails
can be delivered. Enable the sign in methods you want in that same dashboard;
the app uses Clerk's prebuilt forms. No application change is needed to add or
remove a method. OAuth providers are for identity only, with no repository
permissions requested by this application.

The header's Invite action sends invitations through Clerk's server API with
`/sign-in` on the request's origin as the redirect URL. The Clerk form consumes
the invitation ticket. Use this action for the phase acceptance check; Clerk's
own organization management invitation control does not accept a custom
redirect URL.

Configuration reference:
[Clerk Organizations](https://clerk.com/docs/guides/organizations/configure),
[Clerk invitations](https://clerk.com/docs/guides/organizations/add-members/invitations).

## Supabase configuration

Enable [Clerk's Supabase integration](https://dashboard.clerk.com/last-active?path=integrations/supabase).
In the Supabase dashboard, open Authentication, then Third Party Auth, and add
Clerk with this application's Clerk domain. The integration adds
`role: authenticated` to the standard Clerk session token.

Use native third party authentication, not the deprecated Supabase JWT
template. The active organization is included in Clerk's standard token (the
`o.id` claim in version 2). No Supabase Auth session, cookie refresh middleware,
service role client or table is needed in this phase.

Server code constructs a client with `createDatabaseClient()` from
`lib/supabase.ts`. Each client uses the verified Clerk token for its current
request, including the active organization claim. A missing session or active
organization fails before any database request. The factory makes no query.

Reference: [Supabase with Clerk](https://supabase.com/docs/guides/auth/third-party/clerk).

## Run and check

Use `pnpm dev` to start the local application. The terminal checks are
`pnpm typecheck`, `pnpm lint` and `pnpm build`.

The browser acceptance check remains in `docs/specs/phase-01.md` for you to run.

## Phase 02 database

The first migration creates the eight data tables plus the agreed organizations
parent. All nine have RLS and read policies using the Clerk version 2 `o.id`
claim. Session clients have SELECT only. Grants are explicit so the schema also
works when Supabase does not expose new tables automatically.

Apply the tracked migration using the installed Supabase CLI, after linking
this repository to the project matching `NEXT_PUBLIC_SUPABASE_URL`:

```sh
supabase db push
```

Alternatively, supply the project's Postgres connection string through a
shell variable and use `supabase db push --db-url "$SUPABASE_DB_URL"`.
Use the direct connection or session pooler, not the transaction pooler.
The publishable API key cannot apply a database migration.

For an agent to finish hosted setup, place `SUPABASE_DB_URL`,
`SEED_ORGANIZATION_A`, and `SEED_ORGANIZATION_B` in `.env.local` as well.
The last two are the actual Clerk organization IDs for the seed script:
`SEED_ORGANIZATION_A` is Cartograph Demo and `SEED_ORGANIZATION_B` is RidzTalk.
These are setup inputs, not values the dashboard reads. When running the commands
yourself, export `SUPABASE_DB_URL` in the shell; psql does not load `.env.local`.

Seed two actual Clerk organizations using their IDs from the workspace header.
Run against the same Postgres database, as the database owner:

```sh
psql "$SUPABASE_DB_URL" -v organization_a=org_REPLACE_A -v organization_b=org_REPLACE_B -f supabase/seed.sql
psql "$SUPABASE_DB_URL" -f supabase/verify.sql
```

The seed fails if either ID is missing, malformed, or identical. It creates two
demonstration analyses for organization A (Cartograph Demo) and five for
organization B (RidzTalk), marked Seeded in the UI, with different states.
Rerunning replaces only seed analyses for those two teams. It creates no files,
edges, routes, or AI output. New teams without seed rows see the empty state.

The verification script checks all nine tables, policies, grants, tenant
isolation, missing claims, cross team references, cascading deletion, and
repeated deletion. Its temporary fixtures and deletes are rolled back. Run it
with the database owner connection, never against a transaction pooler.

## Clerk deletion webhook

Create a Clerk webhook endpoint pointing to `/api/webhooks/clerk` on the public
URL serving this application. Subscribe to `organization.deleted`. For local
development, use a public forwarding URL to your running app.

Add these server only values to `.env.local` and restart the app:

```dotenv
CLERK_WEBHOOK_SIGNING_SECRET=
SUPABASE_SECRET_KEY=
```

Use the endpoint's signing secret from Clerk and the Supabase project's secret
API key. The secret key is restricted in application code to the verified
deletion handler. The migration grants its database role SELECT and DELETE on
organizations only; database foreign keys cascade the deletion. Never prefix
these variable names with `NEXT_PUBLIC_`.

Invalid signatures return 400. Missing webhook configuration or failed database
deletion returns 500 so Clerk can retry. Successful and repeated deletion returns
204. Other verified event types are ignored. Creation is still seeded in this
phase, and no runtime Clerk organization lookup is added.

References: [Clerk webhook verification](https://clerk.com/docs/guides/development/webhooks/syncing),
[Supabase explicit grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

The phase 02 browser acceptance check is in `docs/specs/phase-02.md`.

If the connection reports `tenant/user not found`, check the project's status
in the Supabase dashboard before changing credentials. A paused project can
produce that error. Resume it and wait until it is healthy, then test the
existing connection again.

## Phase 07 pipeline and progress

Apply all phase 07 migrations with `supabase db push`, using the database
connection described above. They add the parser storage, session write policies,
private progress topic policies and the publishing trigger. No secret client is
used for analysis runs.

On `/workspace`, submit a public GitHub repository URL. The form opens
`/workspace/analyses/<id>` immediately and the server continues the run with
Next's `after`. Repeated submissions return the existing real analysis,
including URL case, trailing slash and `.git` variants. A unique index protects
concurrent submissions. Each organization has its own analysis. Seeded rows
remain demonstration data and do not open progress pages.

The API is `POST /api/analyses`, with JSON such as
`{"repositoryUrl":"https://github.com/sindresorhus/p-limit"}`. It needs the Clerk
session cookie and an `Origin` matching the app. A new analysis returns HTTP 202
with `{"id":"...","existing":false}`. An existing one returns HTTP 200 with
`{"id":"...","existing":true}`. There is no rerun endpoint yet.

The pipeline pins the default HEAD to a commit SHA and downloads that commit's
archive without a GitHub token. It extracts into a temporary directory, parses
the whole repository with the fallback adapter and stores file metadata, import
kinds and complete coverage. It never installs or executes repository code.
Limits are 50 MiB downloaded, 200 MiB expanded and 50,000 archive entries. Unsafe
paths and links outside the repository fail explicitly. Temporary files are
removed after either outcome.

Files, edges, coverage and completion commit in one transaction. A failure
records its stage and reason. If the failure cannot be written, the server log
reports it. There is no queue or process recovery. Unfinished runs whose last
stage change is over five minutes old are marked stale. A local clock updates
that label without making database requests.

### Realtime

The progress migration declares the private topic rules on `realtime.messages`
before installing a trigger on `public.analyses`. Supabase's documented private
Broadcast API uses topic RLS policies, rather than a separate channel pattern
registration function. The migration checks that managed Realtime RLS is enabled;
it does not alter the managed table or attach triggers to it.

`analysis:<id>` sends `analysis_progress`, containing only `stage` and `message`.
The failure message names its failed stage. Its read policy requires an analysis
visible to the current Clerk organization. `organization:<id>:analyses` sends an
empty `analysis_created` notification so other dashboard tabs can load the new
row. That topic also requires the matching Clerk organization. Clients receive
only; no broadcast INSERT policy is added.

The hosted `realtime.send` function runs with its caller's permissions. A follow
up migration moves the publisher into `cartograph_internal` and makes only that
trigger a security definer. It verifies the row's Clerk organization claim,
uses an empty search path and grants no direct execution to session clients.
The trigger supplies only the stage and message; Supabase adds its own transport
message ID. Clients still have no broadcast INSERT policy.

The browser client uses Clerk's `getToken` as Supabase's `accessToken` provider,
with private channels and the publishable key. Token requests bypass Clerk's
cache so socket heartbeats receive a fresh token. It opens authenticated sockets
without storing a separate token. Server code continues to handle all database
reads. One server snapshot after joining or rejoining closes the gap between
the initial read and the subscription. Later stage updates come from the socket.
Connection and synchronization failures appear on screen with the service's
error message when available. Closed or failed channels are recreated with
backoff; their timers and sockets are cleaned up when leaving the page. Late messages cannot
move a completed run back to an earlier stage. Supabase transport metadata never
replaces the analysis ID attached to its channel.

In the Supabase dashboard, keep Realtime enabled and disable **Allow public
access** in Realtime settings. A connected client provisions the day's managed
broadcast partition, so open the signed in dashboard before testing database
broadcasts. No migration changes the Realtime service's own machinery.

The progress page currently ends with the completed state and stored file
counts. Explorer wiring, the coverage banner and removal of the preview fixture
remain for the next phase 07 slice.

### Terminal verification

```sh
pnpm verify:pipeline
pnpm verify:progress
pnpm typecheck
pnpm lint
pnpm build
```

The pipeline check uses controlled archives and database responses to exercise
commit pinning, extraction safety, nested aliases, coverage and failure handling.
The progress check covers message validation, stale timing, failure messages and
late stage regression. Browser acceptance remains yours to run.

For storage and tenant isolation, produce parser JSON with
`pnpm parse <repository-directory> --output /tmp/cartograph-result.json`, then run:

```sh
node --env-file=.env.local scripts/verify-pipeline-storage.ts /tmp/cartograph-result.json
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/verify-progress.sql
```

The first command loads `SUPABASE_DB_URL` from `.env.local`; export it yourself
for psql. Both checks need the database owner connection and applied migrations.
The storage check validates the parser JSON, then verifies deduplication, atomic
rollback, exact data and tenant isolation. The progress SQL checks private topic
policies, exact trigger payloads, failed stage messages and rejection of client
broadcasts. Their temporary organizations and messages are rolled back. These
SQL checks do not replace testing the hosted socket with a real Clerk session.
