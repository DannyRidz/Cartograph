import type { PathReferences } from "./path-references.ts";

export const PATH_EVALUATOR_VERSION = 2;

/** Exact spelling matters: a basename, alias or normalized path is not a supplied path. */
export function inventedPaths(explanation: string, paths: readonly string[], references?: PathReferences) {
  const supplied = new Set(paths);
  const external = new Set([...(references?.externalSpecifiers ?? []), ...(references?.moduleSpecifiers ?? [])]);
  const symbols = new Set(references?.codeSymbols);
  const tokens = new Set<string>();
  const ignored = new Set<string>();
  const result = () => {
    const mentioned = [...tokens].sort();
    const invented = mentioned.filter((token) => !supplied.has(token));
    return { key: "invented_paths", version: PATH_EVALUATOR_VERSION, score: invented.length ? 0 : 1,
      mentioned, invented, ignoredReferences: [...ignored].sort(),
      comment: invented.length ? `Not supplied: ${invented.join(", ")}` : `All ${mentioned.length} repository path tokens were supplied.` };
  };
  // Rejected structured summaries are also evaluated offline. Decode their
  // string values so JSON quotes do not turn entire sentences into filenames.
  if (explanation.trimStart().startsWith("{")) {
    try {
      const value: unknown = JSON.parse(explanation);
      const object = (entry: unknown): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry);
      if (object(value) && typeof value.overview === "string" && Object.keys(value).every((key) => key === "overview" || key === "members")) {
        const text = [value.overview];
        if (value.members !== undefined) {
          if (!Array.isArray(value.members)) throw new Error("Not a source summary.");
          for (const member of value.members) {
            if (!object(member) || typeof member.path !== "string" || typeof member.summary !== "string"
              || !Object.keys(member).every((key) => key === "path" || key === "summary")) throw new Error("Not a source summary.");
            text.push(member.path, member.summary);
          }
        }
        for (const part of text) {
          const evaluation = inventedPaths(part, paths, references);
          evaluation.mentioned.forEach((token) => tokens.add(token));
          evaluation.ignoredReferences.forEach((token) => ignored.add(token));
        }
        return result();
      }
    } catch { /* Unrecognized JSON follows the ordinary text token rules. */ }
  }
  // Product names are prose, but an explicit file/path label or ./ prefix still
  // makes even these spellings a file claim. They never enter `supplied`.
  const brands = new Set(["Next.js", "Node.js", "Nuxt.js", "Vue.js", "React.js", "React/Next.js"]);
  const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs", ".json"]);
  const clean = (value: string) => {
    let token = value.replace(/[.,;:!?]+$/, "");
    if (supplied.has(token)) return token;
    for (const [open, close] of [["(", ")"], ["[", "]"]]) {
      while (token.endsWith(open) && token.split(open).length > token.split(close).length) token = token.slice(0, -1);
      if (token.startsWith(open) && token.endsWith(close)) token = token.slice(1, -1);
      while (token.endsWith(close) && token.split(close).length > token.split(open).length) token = token.slice(0, -1);
    }
    return token;
  };
  const consider = (raw: string, quoted: boolean, offset: number) => {
    const token = clean(raw);
    if (!token) return false;
    const labelled = /\b(?:file|filename|path|directory|folder)(?:\s+(?:named|called|at))?\s*[:=]?\s*$/i.test(explanation.slice(Math.max(0, offset - 55), offset));
    const prefixed = /^(?:\.{1,2}[/\\]|[/\\]|[A-Za-z]:[/\\])/.test(token) || /[/\\]$/.test(token);
    const explicit = prefixed || (labelled && quoted);
    if (supplied.has(token)) { tokens.add(token); return true; }
    if (!prefixed && !labelled && (brands.has(token) || extensions.has(token) || external.has(token) || symbols.has(token))) { ignored.add(token); return true; }
    const filename = /(?:^|[/\\])[\p{L}\p{N}_@()[\]~+*?-][\p{L}\p{N}_@.()[\]~+*? -]*\.[a-z][a-z\d_-]*$/iu.test(token);
    const dotfile = /^\.[\p{L}_][\p{L}\p{N}_.-]*$/u.test(token);
    // A slash between prose words is not enough. Bare a/b is prose; `a/b`
    // and ./a/b are explicit paths. Arbitrary filename extensions are supported.
    const quotedDirectory = quoted && /[/\\]/.test(token) && !/\s/.test(token);
    const globPath = /[/\\]/.test(token) && /[*?{}]/.test(token);
    const validCharacters = /^[\p{L}\p{N}_@.()[\]~+*?{}, /\\-]+$/u.test(token);
    if (validCharacters && (filename || dotfile || explicit || quotedDirectory || globPath)) { tokens.add(token); return true; }
    return false;
  };
  // Blank excluded spans in place, preserving offsets for file labels. URL
  // destinations are not repository paths; markdown labels are still scanned.
  const remainder = explanation.replace(/https?:\/\/[^\s`"'<>]+/g, (url: string) => " ".repeat(url.length))
    .replace(/`([^`\n]+)`|"([^"\n]+)"|(?<![\p{L}\p{N}_])'([^'\n]+)'(?![\p{L}\p{N}_])/gu,
      (match: string, code: string | undefined, double: string | undefined, single: string | undefined, offset: number) => {
        const token = code ?? double ?? single ?? "";
        if (/^[\p{L}\p{N}_@.()[\]~+*?{}, /\\-]+$/u.test(token) && consider(token, true, offset)) {
          return " ".repeat(match.length);
        }
        return match;
      });
  const bare = /(?:\.{0,2}[/\\])?[\p{L}\p{N}_@.()[\]~+*?{}-]+(?:[/\\][\p{L}\p{N}_@.()[\]~+*?{},-]+)*[/\\]?/gu;
  for (const match of remainder.matchAll(bare)) consider(match[0], false, match.index);
  return result();
}
