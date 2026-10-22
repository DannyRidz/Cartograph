# Cartograph agent

The phase 12 Managed Deep Agents service answers questions using six HTTP
repository lookup tools. It receives an analysis grant outside model messages
and uses the app's read only endpoints. It has no database credential or fixture
binding. The app's authenticated Ask relay owns access checks and supplies a
fresh grant for every turn.

The runtime owns the HTTP server, private threads and streaming. `agent.ts`
exports the managed definition; `instructions.md` carries refusals and the never
infer rule. Middleware exposes only the six lookup tools and requires a lookup
for every turn. The planner, filesystem and delegation tools are filtered from
model requests and blocked at execution. No sandbox or shared memory is enabled.

## Run locally

From `deep-agent/`, copy `.env.example` to `.env` and supply `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, `CARTOGRAPH_APP_URL`, and `MDA_INGRESS_SECRET` (the same ingress secret as the app). Do not copy secrets into source files. The existing local Node 22 runtime is used by pnpm scripts.

```sh
pnpm start
```

This runs `mda dev` bound to `127.0.0.1`. The app reaches its HTTP address. Studio can inspect runs, but a bare Studio question has no analysis grant. The assistant ID is `cartograph`. Let the runtime create threads and stream runs; reuse a thread for follow ups. No custom server or conversation storage is implemented here. No deployment is performed.

## Tools

| Tool | Recorded data |
| --- | --- |
| `analysis_summary` | Adapter, counts, roles, skipped files, import coverage |
| `search_files` | Literal case insensitive path fragment |
| `files_by_role` | Exact recorded role, with parser kind as fallback |
| `file_neighbours` | Direct importers or dependencies |
| `walk_dependencies` | Canvas traversal in either direction, default depth two |
| `route_table` | Only fully recovered method and route patterns |

Lists accept `offset` and `limit` (default 50, maximum 100), return `total` and `nextOffset`, and never silently truncate. Walk results include shortest import distance and exclude the start. An unknown file returns an explicit absence result. Roles and paths are data, never instructions. No tool accepts an analysis ID, organization ID, URL, token or source directory.

`createRepositoryTools` binds one validated parser result for offline verification. The live agent uses `createHttpTools`, which keeps the bearer in runtime context and emits lookup lifecycle events through the runtime writer. It imports `indexGraph`, `walkGraph` and `repositoryDetails` from generated copies of the canonical canvas sources. `prepare:shared` copies those sources, parser validation and the public fixture into the ignored `shared/` build directory before checks or startup. This makes the managed build self contained while keeping one source of graph logic. Never edit generated copies. Run the pnpm scripts rather than invoking `mda` directly after changes to shared sources.

The model is constructed only in `model.ts`, retaining the scaffold's OpenAI model. LangChain performs its process local cache lookup inside the model trace; cached calls are traced without a provider request. LangSmith tracing records the runtime's tool calls and model activity.

## Terminal checks

```sh
pnpm typecheck
pnpm lint
pnpm verify:tools
pnpm build
```

These do not need provider credentials or call a model. `build` performs TypeScript checking and compiles the managed project. The verification script calls all six tools and compares neighbours and traversal against the canonical canvas functions. The browser acceptance check and agent evaluation remain separate later slices.

## App integration

The app's Overview/Ask pane streams custom lookup events and message chunks through
its authenticated relay. Backend identity gives each hashed user, organization
and analysis tuple private runtime threads. `MDA_INGRESS_SECRET` stays on the two
servers. `CARTOGRAPH_APP_URL` is fixed service configuration, never model input.
No analysis ID, URL or credential is accepted as a tool argument. The phase 12 agent behavior evaluation is recorded in `../evals/agent/`, using
actual browser answers and independently frozen parser truth.

References: [Managed Deep Agents identity](https://docs.langchain.com/langsmith/javascript/managed-deep-agents-identity),
[Agent Server API](https://docs.langchain.com/langsmith/agent-server-openapi.json).
