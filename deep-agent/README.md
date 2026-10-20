# Deep Agents research quickstart

Standalone TypeScript example following the [official quickstart](https://docs.langchain.com/oss/javascript/deepagents/quickstart).

## Behaviour

Use `createDeepAgent` with OpenAI `gpt-5.5`, a research system prompt, and OpenAI's built-in web search. Research “What is LangGraph?” by default, or a question supplied on the command line, and print the final answer with source links. Filesystem tools use the default ephemeral state backend. Only `OPENAI_API_KEY` is required; no Tavily or LangSmith setup.

Acceptance: a run returns a research answer with sources. Missing credentials or a provider failure must exit unsuccessfully with an actionable message. This example is independent of Cartograph's parser, AI client, and database.

## Run

```sh
cd deep-agent
pnpm install
cp .env.example .env
# Set OPENAI_API_KEY in .env.
pnpm start
pnpm start "How does LangGraph handle durable execution?"
```

The package includes a local Node 22 runtime, so the system Node installation stays unchanged. Model and web search calls use your OpenAI account's billing. Keep your key in the gitignored `.env` file.

```sh
pnpm typecheck
pnpm build
```

For customization, use the installed `deep-agents-core` skill or the [customization guide](https://docs.langchain.com/oss/javascript/deepagents/customization).
