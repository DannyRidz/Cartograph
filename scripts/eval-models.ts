import "./lib/environment.ts";
import { flushTraces, traceClient, tracingConfigured } from "../lib/ai/client.ts";
import { roleAccuracy, comparePrompts } from "../evals/experiments.ts";
import { verifySavedResults } from "../evals/results.ts";

async function main() {
  const command = process.argv[2];
  if (command !== "results" && !process.env.OPENAI_API_KEY?.trim()) throw new Error("Set OPENAI_API_KEY in .env.local.");
  if (!tracingConfigured()) throw new Error("Set LANGSMITH_API_KEY and LANGSMITH_TRACING=true in .env.local.");
  if (command === "roles") await roleAccuracy();
  else if (command === "prompts") await comparePrompts();
  else if (command === "results") await verifySavedResults(traceClient());
  else throw new Error("Choose roles, prompts or results.");
}
try { await main(); }
catch (error) { console.error(error); process.exitCode = 1; }
finally { await flushTraces(); }
