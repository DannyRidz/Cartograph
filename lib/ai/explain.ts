import "server-only";
import { getAnalysis, getStoredRepository } from "../analyses";
import { createDatabaseClient } from "../supabase";
import { publicRepository } from "../pipeline/repository";
import { foldRepository } from "../canvas/folding";
import { fileContext } from "./context";
import { cachedAI, contentHash } from "./cache";
import { aiClient, MODEL, tracingConfigured, flushTraces } from "./client";
import { repositoryHead, repositorySource } from "./repository-source";
import type { Explanation } from "./types";
import { explanationGraph, explanationPrompt, explanationSchema, renderExplanation } from "./explanation-context";

export async function explain(analysisId: string, target: string, kind: "file" | "folder"): Promise<Explanation> {
  const analysis = await getAnalysis(analysisId);
  if (!analysis || analysis.state !== "completed" || analysis.is_seed || !analysis.commit_sha || !analysis.projects?.repository_url) throw new Error("A completed repository analysis is required.");
  const commit = analysis.commit_sha;
  const repository = await getStoredRepository(analysis);
  const publicRepo = publicRepository(analysis.projects.repository_url);
  const file = repository.files.find((member) => member.path === target);
  const folder = kind === "folder" ? foldRepository(repository.files, repository.edges).modules.find((member) => member.id === target) : undefined;
  if (kind === "file" ? !file : !folder) throw new Error("Select a file or folded folder from this analysis.");
  const members = folder?.files ?? (file ? [file] : []);
  const memberPaths = new Set(members.map((member) => member.path));
  const edges = repository.edges.filter((edge) => memberPaths.has(edge.from) || memberPaths.has(edge.to))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
  const suppliedPaths = new Set([...memberPaths, ...edges.flatMap((edge) => [edge.from, edge.to])]);
  const graph = explanationGraph(edges, [...memberPaths]);
  const schema = explanationSchema(kind);
  const context = kind === "file" && file ? fileContext(repository, file) : {
    folder: target, members, edges, neighbours: repository.files.filter((member) => suppliedPaths.has(member.path) && !memberPaths.has(member.path)),
  };
  const database = await createDatabaseClient();
  const head = await repositoryHead(publicRepo);
  // Each explained member is checked against real content, even on a cache hit.
  // Folder content is metadata plus hashes for every member, never one proxy file.
  const sources = new Map<string, string>();
  let changed = 0;
  for (let start = 0; start < members.length; start += 4) {
    const checked = await Promise.all(members.slice(start, start + 4).map(async (member) => ({
      member, source: await repositorySource(publicRepo, head, member.path),
    })));
    for (const { member, source } of checked) {
      if (source === null || contentHash(source) !== member.hash) changed++;
      else sources.set(member.path, source);
    }
  }
  const stale = changed ? `${changed} explained ${changed === 1 ? "file has" : "files have"} changed or been removed since this analysis.`
    : head !== analysis.commit_sha ? "The repository has moved past the commit that was analysed." : null;
  try {
    // Prompt changes invalidate explanations without discarding role labels.
    const result = await cachedAI(database, kind, { prompt: explanationPrompt, schema, target, context, graph }, async () => {
      if (stale) {
        // The stored graph is immutable. Never explain new source with old edges.
        for (const member of members) {
          if (sources.has(member.path)) continue;
          const source = await repositorySource(publicRepo, commit, member.path);
          if (source === null || contentHash(source) !== member.hash) throw new Error("The analysed file content could not be verified. Re-analyse the repository.");
          sources.set(member.path, source);
        }
      }
      const input = JSON.stringify({ kind, target, context, graph, sources: [...sources].map(([path, source]) => ({ path, source })) });
      if (input.length > 600_000) throw new Error("This selection exceeds the 600,000 character explanation input limit. No files or neighbours were omitted. Select a smaller folder or file.");
      const response = await aiClient().chat.completions.create({ model: MODEL, temperature: 0, max_completion_tokens: 1800,
        messages: [{ role: "system", content: explanationPrompt }, { role: "user", content: input }],
        response_format: { type: "json_schema", json_schema: { name: "source_summaries", strict: true, schema } },
      });
      const body = response.choices[0]?.message.content;
      if (!body?.trim() || response.choices[0]?.finish_reason !== "stop") throw new Error("The model did not return a complete explanation. Try again.");
      const summaries: unknown = JSON.parse(body);
      return renderExplanation(summaries, kind, [...memberPaths], [...suppliedPaths], graph);
    });
    return { body: result.body, cached: result.cached, stale, paths: [...suppliedPaths].sort(), checkedAt: new Date().toISOString(), tracing: tracingConfigured(), model: MODEL };
  } finally { await flushTraces(); }
}
