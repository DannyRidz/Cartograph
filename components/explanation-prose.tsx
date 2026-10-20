import type { ReactNode } from "react";

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A deliberately small renderer: no HTML or model supplied link destinations. */
export function ExplanationProse({ body, paths, select }: { body: string; paths: string[]; select: (path: string) => void }) {
  const pattern = paths.length ? new RegExp(`(?<![\\w/.-])(${[...paths].sort((a, b) => b.length - a.length).map(escapePattern).join("|")})(?![\\w/-])`, "g") : null;
  function links(text: string): ReactNode {
    if (!pattern) return text;
    const result: ReactNode[] = [];
    let start = 0;
    for (const match of text.matchAll(pattern)) {
      result.push(text.slice(start, match.index));
      result.push(<button type="button" className="explanation-path" key={`${match.index}:${match[0]}`} onClick={() => select(match[0])}><code>{match[0]}</code></button>);
      start = match.index + match[0].length;
    }
    result.push(text.slice(start));
    return result;
  }
  function inline(text: string): ReactNode {
    return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
      if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{links(part.slice(1, -1).replace(/[*#]/g, ""))}</code>;
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{inline(part.slice(2, -2))}</strong>;
      return <span key={index}>{links(part.replace(/[`*#]/g, ""))}</span>;
    });
  }
  // Unsupported markdown is reduced to text rather than leaking punctuation.
  const lines = body.replace(/```[^\n]*\n?|```/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").split(/\r?\n/);
  const blocks: { bullet: boolean; lines: string[] }[] = [];
  for (const line of lines) {
    if (!line.trim()) { blocks.push({ bullet: false, lines: [] }); continue; }
    const bullet = /^\s*[-*+]\s+/.test(line);
    const clean = line.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "");
    const last = blocks.at(-1);
    if (last && last.bullet === bullet && last.lines.length) last.lines.push(clean);
    else blocks.push({ bullet, lines: [clean] });
  }
  return <div className="explanation-prose">{blocks.filter((block) => block.lines.length).map((block, index) => block.bullet
    ? <ul key={index}>{block.lines.map((line, item) => <li key={item}>{inline(line)}</li>)}</ul>
    : <p key={index}>{inline(block.lines.join(" "))}</p>)}</div>;
}
