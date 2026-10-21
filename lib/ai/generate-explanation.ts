import { aiClient, MODEL } from "./client.ts";
import { explanationPrompt, explanationSchema, renderExplanation, type explanationGraph } from "./explanation-context.ts";

export const EXPLANATION_GENERATION_VERSION = 2;

export interface ExplanationMessage { role: "system" | "user" | "assistant"; content: string }
export interface ExplanationRequest {
  kind: "file" | "folder";
  input: string;
  members: string[];
  paths: string[];
  graph: ReturnType<typeof explanationGraph>;
}

export async function completeExplanation(messages: ExplanationMessage[], schema?: ReturnType<typeof explanationSchema>) {
  const response = await aiClient().chat.completions.create({ model: MODEL, temperature: 0, max_completion_tokens: 1800, messages,
    ...(schema ? { response_format: { type: "json_schema" as const, json_schema: { name: "source_summaries", strict: true, schema } } } : {}),
  });
  const body = response.choices[0]?.message.content;
  if (!body?.trim() || response.choices[0]?.finish_reason !== "stop") throw new Error("The model did not return a complete explanation. Try again.");
  return body;
}

/** Correct the output contract once, without relaxing validation or changing source facts. */
export async function generateExplanation(request: ExplanationRequest, complete: (messages: ExplanationMessage[], schema: ReturnType<typeof explanationSchema>) => Promise<string>) {
  const messages: ExplanationMessage[] = [{ role: "system", content: explanationPrompt }, { role: "user", content: request.input }];
  const schema = explanationSchema(request.kind);
  let raw = "";
  let rejection = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    // The caller owns the traced cache read for this completion.
    raw = await complete(messages.map((message) => ({ ...message })), schema);
    try {
      const value: unknown = JSON.parse(raw);
      return { body: renderExplanation(value, request.kind, request.members, request.paths, request.graph), valid: true, attempts: attempt };
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
      if (attempt === 1) messages.push({ role: "assistant", content: raw }, { role: "user", content:
        `Your JSON was rejected by the unchanged production validator: ${rejection}\nReturn corrected JSON using exactly the same source facts and member paths. Fix overview and every member summary. No filename in summary prose, no relationship words or their inflections. Prefer defines, creates, returns, validates and pending states. Do not add facts, paths or relationships.` });
    }
  }
  return { body: raw, valid: false, attempts: 2, rejection };
}
