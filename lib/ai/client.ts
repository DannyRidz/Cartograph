import OpenAI from "openai";
import { Client } from "langsmith";
import { wrapOpenAI } from "langsmith/wrappers/openai";

// Re-pinning this snapshot changes only this model's cache namespace.
export const MODEL = "gpt-4.1-mini-2025-04-14";
export function tracingConfigured() {
  return Boolean(process.env.LANGSMITH_API_KEY?.trim()) && process.env.LANGSMITH_TRACING !== "false";
}
let tracing: Client | undefined;
export function traceClient() {
  return tracing ??= new Client({ apiKey: process.env.LANGSMITH_API_KEY, workspaceId: process.env.LANGSMITH_WORKSPACE_ID, autoBatchTracing: true });
}
let client: ReturnType<typeof createAIClient> | undefined;
function createAIClient() {
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error("Set OPENAI_API_KEY in .env.local to explain and classify files.");
  return wrapOpenAI(new OpenAI({ timeout: 60_000, maxRetries: 1 }), {
    client: traceClient(), tracingEnabled: tracingConfigured(), project_name: process.env.LANGSMITH_PROJECT ?? "Cartograph",
  });
}
export function aiClient() { return client ??= createAIClient(); }
export async function flushTraces() {
  if (tracing && tracingConfigured()) {
    try { await tracing.awaitPendingTraceBatches(); }
    catch { console.error("LangSmith could not upload traces. Check tracing credentials and connectivity."); }
  }
}
