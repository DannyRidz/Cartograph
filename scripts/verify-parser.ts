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
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
