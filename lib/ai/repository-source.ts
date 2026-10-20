import type { PublicRepository } from "../pipeline/repository.ts";

export async function repositoryHead(repository: PublicRepository) {
  const response = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.name}/commits/HEAD`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Cartograph" }, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Could not check the current repository commit (GitHub HTTP ${response.status}).`);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("sha" in value) || typeof value.sha !== "string" || !/^[a-f0-9]{40}$/.test(value.sha)) throw new Error("GitHub returned an invalid commit.");
  return value.sha;
}

export async function repositorySource(repository: PublicRepository, commit: string, path: string): Promise<string | null> {
  // Paths come exclusively from the validated stored parser output.
  const response = await fetch(`https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read repository content (GitHub HTTP ${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("GitHub returned no file content.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 2_000_000) throw new Error(`Cannot explain ${path}: file exceeds the 2 MB content limit.`);
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}
