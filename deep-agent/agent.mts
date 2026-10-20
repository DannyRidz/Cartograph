async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("Set OPENAI_API_KEY in deep-agent/.env, then run pnpm start from deep-agent/.");
  }

  const { createDeepAgent } = await import("deepagents");
  const { ChatOpenAI } = await import("@langchain/openai");

  // Provider search runs through OpenAI's Responses API, without a second API key.
  const model = new ChatOpenAI({ model: "gpt-5.5", useResponsesApi: true });
  const agent = createDeepAgent({
    model,
    tools: [{ type: "web_search" }],
    systemPrompt: "You are an expert researcher. Research the user's question using web search, then write a concise report with links to the sources you used. Prefer official documentation. Distinguish facts from uncertainty and never invent sources.",
  });

  const question = process.argv.slice(2).join(" ").trim() || "What is LangGraph?";
  const result = await agent.invoke({
    messages: [{ role: "user", content: question }],
  });
  const answer = result.messages.at(-1);
  if (!answer || answer.type !== "ai" || !answer.text.trim()) {
    throw new Error("The agent returned no final text answer.");
  }
  console.log(answer.text);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "The research agent failed.");
  process.exitCode = 1;
});
