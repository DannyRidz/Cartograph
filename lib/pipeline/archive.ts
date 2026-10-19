import { mkdir, writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import type { PublicRepository } from "./repository.ts";

const unzip = promisify(gunzip);
const maxArchiveBytes = 50 * 1024 * 1024;
const maxExpandedBytes = 200 * 1024 * 1024;
const headers = { Accept: "application/vnd.github+json", "User-Agent": "Cartograph" };

async function github(url: string): Promise<Response> {
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) throw new Error("GitHub repository or commit was not found. Only public repositories are supported.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub refused the request or its public API rate limit was reached. Try again later.");
    throw new Error(`GitHub request failed (HTTP ${response.status}).`);
  }
  return response;
}

export async function fetchArchive(repository: PublicRepository): Promise<{ commit: string; archive: Buffer }> {
  const base = `https://api.github.com/repos/${repository.owner}/${repository.name}`;
  // HEAD is resolved once, then the archive is fetched by immutable commit SHA.
  const response = await github(`${base}/commits/HEAD`);
  const commit: unknown = await response.json();
  if (!commit || typeof commit !== "object" || !("sha" in commit)
    || typeof commit.sha !== "string" || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("GitHub did not return a commit SHA.");
  const download = await github(`${base}/tarball/${commit.sha}`);
  if (!download.body) throw new Error("GitHub returned an empty archive response.");
  const reader = download.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxArchiveBytes) throw new Error("Repository archive exceeds the 50 MiB download limit.");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  return { commit: commit.sha, archive: Buffer.concat(chunks) };
}

function field(header: Buffer, start: number, length: number): string {
  return header.subarray(start, start + length).toString("utf8").split("\0")[0];
}

function paxFields(body: Buffer): Record<string, string> {
  const fields: Record<string, string> = {};
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(32, offset);
    const size = Number(body.subarray(offset, space).toString());
    if (space < offset || !Number.isSafeInteger(size) || size <= space - offset + 1 || offset + size > body.length) {
      throw new Error("Invalid archive extension header.");
    }
    const record = body.subarray(space + 1, offset + size - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals < 1) throw new Error("Invalid archive extension field.");
    fields[record.slice(0, equals)] = record.slice(equals + 1);
    offset += size;
  }
  return fields;
}

export async function selectArchive(archive: Buffer, directory: string): Promise<string> {
  // Only files and directories are written during extraction. Links are created
  // last, so no archive entry can write through a link outside the temporary tree.
  const tar = await unzip(archive, { maxOutputLength: maxExpandedBytes });
  const links: { filename: string; target: string }[] = [];
  let extensions: Record<string, string> = {};
  let globalExtensions: Record<string, string> = {};
  let root: string | undefined;
  let entries = 0;
  let offset = 0;
  let ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) { ended = true; break; }
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== parseInt(field(header, 148, 8).trim(), 8)) throw new Error("Archive checksum does not match.");
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error("Archive is truncated or has an invalid entry size.");
    const body = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    const type = field(header, 156, 1);
    if (type === "x" || type === "g") {
      if (type === "g") globalExtensions = { ...globalExtensions, ...paxFields(body) };
      else extensions = paxFields(body);
      continue;
    }
    const attributes = { ...globalExtensions, ...extensions };
    extensions = {};
    if (attributes.size !== undefined && Number(attributes.size) !== size) throw new Error("Archive size override is unsupported.");
    const prefix = field(header, 345, 155);
    const entry = attributes.path ?? `${prefix ? `${prefix}/` : ""}${field(header, 0, 100)}`;
    const parts = entry.replace(/\/$/, "").split("/");
    if (entry.includes("\\") || parts.some((part) => !part || part === "." || part === ".." || part.includes("\0"))) throw new Error("Archive contains an unsafe path.");
    root ??= parts[0];
    if (parts[0] !== root) throw new Error("Archive must contain a single repository root.");
    if (++entries > 50_000) throw new Error("Repository exceeds the 50,000 archive entry limit.");
    const filename = path.join(directory, ...parts);
    if (type === "5") await mkdir(filename, { recursive: true });
    else if (type === "0" || type === "" || type === "2") {
      await mkdir(path.dirname(filename), { recursive: true });
      if (type === "2") links.push({ filename, target: attributes.linkpath ?? field(header, 157, 100) });
      else await writeFile(filename, body, { flag: "wx" });
    } else throw new Error(`Unsupported archive entry type: ${type}.`);
  }
  if (!ended || !root) throw new Error("Repository archive is empty or incomplete.");
  for (const link of links) {
    const target = path.resolve(path.dirname(link.filename), link.target);
    const relative = path.relative(path.join(directory, root), target);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error("Archive contains a symbolic link outside the repository.");
    }
    await symlink(link.target, link.filename);
  }
  return path.join(directory, root);
}
