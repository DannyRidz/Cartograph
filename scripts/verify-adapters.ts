import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectRepositoryAdapter } from "../lib/adapters/detect.ts";
import { parseRepository } from "../lib/parser/parse.ts";
import { validateRepositoryResult, writeRepositoryResult } from "../lib/parser/data.ts";
import { taxonomy } from "../lib/adapters/taxonomy.ts";

const temporary = await mkdtemp(path.join(tmpdir(), "cartograph-adapters-"));
async function fixture(name: string, sources: Record<string, string>) {
  const root = path.join(temporary, name);
  for (const [file, text] of Object.entries(sources)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  const result = await parseRepository(root, await detectRepositoryAdapter(root));
  validateRepositoryResult(result);
  return { root, result };
}
try {
  const next = await fixture("next", {
    "package.json": JSON.stringify({ dependencies: { next: "*", react: "*", "@nestjs/core": "*" } }),
    "next.config.ts": 'const config = { basePath: "/docs" }; export default config;',
    "app/(public)/[slug]/page.tsx": 'export default function Page() { return <main />; }',
    "app/api/users/[id]/route.ts": 'export async function GET() {} export const DELETE = async () => {}; const hidden = () => {}; export { hidden as PATCH }; export const POST = factory();',
    "app/@modal/(.)users/page.tsx": 'export default function Page() { return null; }',
    "app/_private/page.tsx": 'export default function Page() { return null; }',
    "app/layout.tsx": 'export default function Layout() { return null; }',
    "app/actions.ts": '"use server"; export async function save() {}',
    "src/app/ignored/page.tsx": 'export default function Page() { return null; }',
    "pages/index.tsx": 'export default function Page() { return null; }',
    "pages/_app.tsx": 'export default function App() { return null; }',
    "pages/api/legacy.ts": 'export default function handler(req, res) {}',
    "pages/(literal)/index.tsx": 'export default function Page() { return null; }',
  });
  assert.equal(next.result.adapter, "nextjs");
  assert(next.result.files.every((file) => taxonomy(next.result.adapter).categories.some((category) => category.role === file.role)));
  assert.deepEqual(next.result.routes?.map(({ method, path }) => [method, path]), [
    ["GET", "/docs"], ["GET", "/docs/[slug]"], ["DELETE", "/docs/api/users/[id]"], ["GET", "/docs/api/users/[id]"], ["PATCH", "/docs/api/users/[id]"],
  ]);
  assert.equal(next.result.files.find((file) => file.path === "app/actions.ts")?.role, "action");
  assert.equal(next.result.files.find((file) => file.path === "app/layout.tsx")?.role, "layout");
  assert.deepEqual(taxonomy("nextjs").categories.slice(0, 3).map((entry) => entry.label), ["Page routes", "API endpoints", "Server actions"]);
  const nestSources = {
    "package.json": JSON.stringify({ dependencies: { "@nestjs/core": "*", "@nestjs/common": "*", react: "*" } }),
    "users.controller.ts": `import { Controller as C, Get as Read, Post, All } from '@nestjs/common';
      @C('users') export class Users { @Read(':id') read() {} @Post() create() {} @Read(dynamic) unknown() {} @All('all') all() {} }
      @C(prefix) class Unknown { @Read('x') read() {} }
      const Get = (x) => x; class Fake { @Get('fake') fake() {} }`,
    "namespaced.controller.ts": `import * as nest from '@nestjs/common';
      @nest.Controller(['cats', 'dogs']) export class Pets { @nest.Get(['', ':id']) read() {} }`,
    "users.service.ts": 'export class UsersService {}',
    "app.module.ts": 'export class AppModule {}',
    "user.entity.ts": 'export class User {}',
  };
  const nest = await fixture("nest", nestSources);
  assert.equal(nest.result.adapter, "nestjs");
  assert.deepEqual(nest.result.routes?.map(({ method, path }) => [method, path]), [
    ["GET", "/cats"], ["GET", "/cats/:id"], ["GET", "/dogs"], ["GET", "/dogs/:id"], ["POST", "/users"], ["GET", "/users/:id"],
  ]);
  assert.deepEqual(nest.result.files.map((file) => file.role).sort(), ["controller", "controller", "entity", "module", "service"]);
  const prefixed = await fixture("prefix", { ...nestSources, "main.ts": 'app.setGlobalPrefix(prefix);' });
  assert.deepEqual(prefixed.result.routes, []);
  const mounted = await fixture("mounted", { ...nestSources, "app.module.ts": "import { RouterModule as Routes } from '@nestjs/core'; export const router = Routes.register([{ path: 'api', module: Feature }]);" });
  assert.deepEqual(mounted.result.routes, []);
  const dynamic = await fixture("dynamic", { "package.json": '{"dependencies":{"next":"*"}}', "next.config.js": 'export default wrapper({});', "app/page.tsx": 'export default function Page() { return null; }' });
  assert.deepEqual(dynamic.result.routes, []);
  const react = await fixture("react", { "package.json": '{"dependencies":{"react":"*"}}', "View.tsx": 'export const View = () => <div />;', "useStore.ts": 'export function useStore() {}' });
  assert.equal(react.result.adapter, "react");
  assert.deepEqual(react.result.files.map((file) => file.role).sort(), ["component", "hook"]);
  const generic = await fixture("generic", { "file.ts": 'export const value = 1;', "script.ts": 'const local = 1;' });
  assert.equal(generic.result.adapter, "fallback");
  assert.deepEqual(generic.result.routes, []);
  assert.deepEqual(generic.result.files.map((file) => file.role), ["module", "script"]);
  assert.throws(() => validateRepositoryResult({ ...generic.result, routes: [{ file: "missing.ts", method: "GET", path: "/" }] }), /missing file/);
  if (process.argv[2]) await writeRepositoryResult(process.argv[2], nest.result);
  console.log("Adapters: detection order, roles, exact literal routes, aliases, namespace imports, dynamic omissions, config prefixes, private paths and fallback passed.");
} finally { await rm(temporary, { recursive: true, force: true }); }
