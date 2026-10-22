import { copyFile, mkdir } from 'node:fs/promises';

// Package the canonical parser and canvas code, never a second implementation.
const files = [
  'lib/agent/queries.ts', 'lib/parser/types.ts', 'lib/parser/data.ts', 'lib/parser/graph.ts',
  'lib/canvas/graph.ts', 'lib/canvas/details.ts',
  'lib/fixtures/redux-toolkit.json',
];
for (const file of files) {
  const destination = new URL(`../shared/${file}`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  await copyFile(new URL(`../../${file}`, import.meta.url), destination);
}
