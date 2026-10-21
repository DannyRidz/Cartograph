import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { traceable } from "langsmith/traceable";
import { contentHash } from "../lib/ai/cache.ts";
import { MODEL, traceClient, tracingConfigured } from "../lib/ai/client.ts";

export async function evalCached(name: string, input: object, generate: () => Promise<string>) {
  const run = traceable(async (request: object) => {
    const directory = new URL("./.cache/", import.meta.url);
    const filename = new URL(`${contentHash(JSON.stringify({ name, model: MODEL, request }))}.json`, directory);
    try {
      const value: unknown = JSON.parse(await readFile(filename, "utf8"));
      if (typeof value !== "string") throw new Error("Invalid eval cache entry.");
      return { body: value, cached: true };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const body = await generate();
    await mkdir(directory, { recursive: true });
    const temporary = new URL(`${filename.pathname}.${randomUUID()}.tmp`, filename);
    await writeFile(temporary, JSON.stringify(body), { flag: "wx" });
    await rename(temporary, filename);
    return { body, cached: false };
  }, { name: `cartograph.eval.${name}`, client: traceClient(), tracingEnabled: tracingConfigured(),
    project_name: process.env.LANGSMITH_PROJECT ?? "Cartograph", metadata: { model: MODEL } });
  return (await run(input)).body;
}
