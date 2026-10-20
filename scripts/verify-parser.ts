import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseRepository } from "../lib/parser/parse.ts";
import { readRepositoryResult, validateRepositoryResult, writeRepositoryResult } from "../lib/parser/data.ts";

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "cartograph-parser-"));
  try {
    const renameFixture = path.join(root, "rename");
    await mkdir(renameFixture);
    await writeFile(path.join(renameFixture, "entry.ts"), 'import { target } from "./target";\nexport { target };\n');
    await writeFile(path.join(renameFixture, "target.ts"), "export const target = 1;\n");
    const before = await parseRepository(renameFixture);
    assert.equal(before.coverage.totals.unresolved, 0);
    assert.equal(before.edges.length, 1);
    await rename(path.join(renameFixture, "target.ts"), path.join(renameFixture, "renamed.ts"));
    const after = await parseRepository(renameFixture);
    assert.equal(after.coverage.totals.unresolved, 1);
    assert.equal(after.edges.length, 0);
    assert.equal(after.coverage.imports[0].reason, "local module target could not be resolved");
    console.log("Rename: exactly 1 unresolved import, local module target could not be resolved");

    const folderFixture = path.join(root, "folders");
    for (let folder = 0; folder < 60; folder++) {
      const directory = path.join(folderFixture, "packages", `module-${folder}`, "src");
      await mkdir(directory, { recursive: true });
      for (let file = 0; file < 4; file++) {
        await writeFile(path.join(directory, `file-${file}.ts`), `export const value = ${file};\n`);
      }
    }
    const folders = await parseRepository(folderFixture);
    assert.equal(folders.files.length, 240);
    assert.equal(folders.coverage.folders, 60);
    assert(folders.files.every((file) => file.folder === path.posix.dirname(file.path)));
    console.log("Folder granularity: 240 files in 60 distinct full folder paths");

    const importsFixture = path.join(root, "imports");
    await mkdir(importsFixture);
    await writeFile(path.join(importsFixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }));
    await writeFile(path.join(importsFixture, "target.ts"), "export const target = 1;\n");
    await writeFile(path.join(importsFixture, "style.css"), "body {}\n");
    await writeFile(path.join(importsFixture, "broken.ts"), "export const = ;\n");
    await writeFile(path.join(importsFixture, "entry.ts"), [
      'import { target } from "@/target";',
      'import { target as again } from "@/target";',
      'export { target } from "./target";',
      'export * from "./target";',
      'import("./target");',
      'import("./style.css");',
      'import("./broken");',
      'const name = "./target"; import(name);',
    ].join("\n"));
    const imports = await parseRepository(importsFixture);
    assert.deepEqual(imports.coverage.totals, { resolved: 5, external: 0, excluded: 2, unresolved: 1 });
    assert.equal(imports.edges.length, 3);
    assert.equal(imports.files.find((file) => file.path === "target.ts")?.fanIn, 1);
    assert.equal(imports.files.find((file) => file.path === "entry.ts")?.fanOut, 1);
    assert(imports.coverage.skipped.some((file) => file.path === "broken.ts" && file.reason.startsWith("syntax error:")));
    const output = path.join(root, "result.json");
    await writeRepositoryResult(output, imports);
    assert.deepEqual(await readRepositoryResult(output), imports);
    assert.throws(() => validateRepositoryResult({ ...imports, schemaVersion: 2 }));
    assert.throws(() => validateRepositoryResult({ ...imports, edges: [] }));
    console.log("Imports: aliases, all 3 edge kinds, deduplication, fan counts, exclusions, and nonliteral failures verified");
    console.log("Data contract: JSON round trip passes, invalid version and inconsistent edges rejected");

    const commonFixture = path.join(root, "commonjs");
    await mkdir(path.join(commonFixture, "folder"), { recursive: true });
    await writeFile(path.join(commonFixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": ["./*"] } } }));
    await writeFile(path.join(commonFixture, "package.json"), '{"dependencies":{"express":"*"}}');
    await writeFile(path.join(commonFixture, "target.js"), 'exports.read = () => {}; module.exports.write = () => {}; exports["remove"] = () => {};');
    await writeFile(path.join(commonFixture, "folder/index.cjs"), 'module.exports = { save() {}, "load": () => {}, [unknown]: 1, ...other };');
    await writeFile(path.join(commonFixture, "entry.js"), [
      'import "./target";', 'require("./target");', 'require("@/target");',
      'require("./folder");', 'require("node:fs");', 'require("express");',
      'require("./missing");', 'require(name);', 'object.require("./fake");',
      'function local(require) { require("./fake"); }',
      'module.exports = function app() {};',
    ].join("\n"));
    // Use an explicit .cjs path since resolution is deliberately identical to imports.
    await writeFile(path.join(commonFixture, "folder-user.cjs"), 'const folder = require("./folder/index.cjs");');
    await writeFile(path.join(commonFixture, "shadowed.js"), 'function local(exports, module) { exports.fake = 1; module.exports = {}; } const require = () => {}; require("./target");');
    const common = await parseRepository(commonFixture);
    validateRepositoryResult(common);
    assert.equal(common.edges.filter((edge) => edge.from === "entry.js" && edge.to === "target.js").length, 1);
    assert.deepEqual(common.coverage.totals, { resolved: 4, external: 2, excluded: 0, unresolved: 3 });
    assert.deepEqual(common.files.find((file) => file.path === "target.js")?.exports, ["read", "remove", "write"]);
    assert.deepEqual(common.files.find((file) => file.path === "folder/index.cjs")?.exports, ["load", "save"]);
    assert.deepEqual(common.files.find((file) => file.path === "entry.js")?.exports, ["default"]);
    assert(common.files.filter((file) => file.path !== "shadowed.js").every((file) => file.kind === "module"));
    assert.equal(common.files.find((file) => file.path === "shadowed.js")?.kind, "script");
    assert.equal(common.files.find((file) => file.path === "shadowed.js")?.exports, undefined);
    assert(common.coverage.imports.some((entry) => entry.reason === "require() argument is not a string literal"));
    await writeRepositoryResult(output, common);
    assert.deepEqual(await readRepositoryResult(output), common);
    console.log("CommonJS: shared resolution, mixed syntax deduplication, coverage, shadowed calls, export names and JSON round trip passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
