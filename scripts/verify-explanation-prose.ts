import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Compile just the component for a terminal check, without a browser or runner.
const source = await readFile(new URL("../components/explanation-prose.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
const exported: Record<string, unknown> = {};
runInNewContext(compiled.outputText, { exports: exported, require: createRequire(import.meta.url) });
const renderer = exported.ExplanationProse;
assert.equal(typeof renderer, "function");
if (typeof renderer !== "function") throw new Error("Missing explanation renderer.");
const element: unknown = renderer({ body: "## Unexpected heading\n\n**Calls** `src/a.ts` and src/b.ts.\n\n- Uses `value`\n- [src/a.ts](https://untrusted.invalid)\n\n<script>alert(1)</script> *stray* `unfinished #", paths: ["src/a.ts", "src/b.ts"], select: () => {} });
assert(isValidElement(element));
const html = renderToStaticMarkup(element);
assert(html.includes("<strong>") && html.includes("Calls"));
assert(html.includes("<ul>"));
assert(html.includes("<code>value</code>"));
assert.equal((html.match(/class="explanation-path"/g) ?? []).length, 3);
assert(!/<h[1-6]|<script>|href=/.test(html));
assert(!/[`*#]/.test(html));
assert(html.includes("&lt;script&gt;"));
console.log("Explanation renderer verified: inline code, bold, bullets, repository path controls, escaped HTML and no unsupported markdown markers.");
