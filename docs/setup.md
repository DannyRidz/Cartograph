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
