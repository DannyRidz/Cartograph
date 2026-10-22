import { indexGraph, walkGraph, type Direction } from '../canvas/graph.ts';
import { repositoryDetails } from '../canvas/details.ts';
import type { RepositoryResult } from '../parser/types.ts';

interface Page { offset: number; limit: number }
function page<T>(items: T[], { offset, limit }: Page) {
  return { items: items.slice(offset, offset + limit), total: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null };
}
export function repositoryQueries(repository: RepositoryResult) {
  const files = [...repository.files].sort((a, b) => a.path.localeCompare(b.path));
  const roles = [...new Set(files.map((file) => file.role ?? file.kind))].sort();
  return {
    analysis_summary: () => ({ adapter: repository.adapter, files: files.length, edges: repository.edges.length,
      routes: repository.routes?.length ?? 0,
      roles: roles.map((role) => ({ role, count: files.filter((file) => (file.role ?? file.kind) === role).length })),
      coverage: { filesFound: repository.coverage.filesFound, filesParsed: repository.coverage.filesParsed,
        filesSkipped: repository.coverage.filesSkipped, excludedDirectories: repository.coverage.excludedDirectories,
        skipped: repository.coverage.skipped, imports: repository.coverage.totals } }),
    search_files: (args: Page & { query: string }) => page(files.filter((file) => file.path.toLowerCase().includes(args.query.toLowerCase())), args),
    files_by_role: (args: Page & { role: string }) => ({ ...page(files.filter((file) => (file.role ?? file.kind) === args.role), args), availableRoles: roles }),
    file_neighbours: (args: Page & { path: string; direction: Direction }) => {
      const file = repositoryDetails(repository.files, repository.edges).files.get(args.path);
      if (!file) return { error: 'File is absent from the parsed analysis.', path: args.path };
      return { path: args.path, direction: args.direction, ...page(args.direction === 'incoming' ? file.dependents : file.imports, args) };
    },
    walk_dependencies: (args: Page & { path: string; direction: Direction; depth: number }) => {
      const graph = indexGraph(repository.files, repository.edges);
      if (!graph.outgoing.has(args.path)) return { error: 'File is absent from the parsed analysis.', path: args.path };
      return { path: args.path, direction: args.direction, depth: args.depth, ...page(walkGraph(graph, args.path, args.direction, args.depth), args) };
    },
    route_table: (args: Page) => page([...(repository.routes ?? [])].sort((a, b) => a.path.localeCompare(b.path)
      || a.method.localeCompare(b.method) || a.file.localeCompare(b.file)), args),
  };
}
export const toolNames = ['analysis_summary', 'search_files', 'files_by_role', 'file_neighbours', 'walk_dependencies', 'route_table'] as const;
export class InvalidToolInput extends Error {}

// Validate before touching the database. Scope identifiers are never accepted.
export function prepareRepositoryQuery(tool: string, search: URLSearchParams) {
  const fields: Record<string, string[]> = {
    analysis_summary: [], search_files: ['query', 'offset', 'limit'], files_by_role: ['role', 'offset', 'limit'],
    file_neighbours: ['path', 'direction', 'offset', 'limit'], walk_dependencies: ['path', 'direction', 'depth', 'offset', 'limit'],
    route_table: ['offset', 'limit'],
  };
  if (!Object.hasOwn(fields, tool)) throw new InvalidToolInput('Unknown repository tool.');
  for (const key of search.keys()) {
    if (!fields[tool].includes(key) || search.getAll(key).length !== 1) throw new InvalidToolInput('Unknown or repeated tool parameter.');
  }
  function integer(key: string, fallback: number, minimum: number, maximum: number) {
    const raw = search.get(key);
    const value = raw === null ? fallback : Number(raw);
    if ((raw !== null && !/^\d+$/.test(raw)) || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new InvalidToolInput(`Invalid ${key}.`);
    return value;
  }
  function text(key: string) {
    const value = search.get(key);
    if (!value?.trim() || value.length > 4096) throw new InvalidToolInput(`Supply ${key}.`);
    return value;
  }
  const paging = { offset: integer('offset', 0, 0, Number.MAX_SAFE_INTEGER), limit: integer('limit', 50, 1, 100) };
  if (tool === 'analysis_summary') return (repository: RepositoryResult) => repositoryQueries(repository).analysis_summary();
  if (tool === 'search_files') { const query = text('query').trim(); return (repository: RepositoryResult) => repositoryQueries(repository).search_files({ ...paging, query }); }
  if (tool === 'files_by_role') { const role = text('role'); return (repository: RepositoryResult) => repositoryQueries(repository).files_by_role({ ...paging, role }); }
  if (tool === 'route_table') return (repository: RepositoryResult) => repositoryQueries(repository).route_table(paging);
  const path = text('path');
  const direction = search.get('direction');
  if (direction !== 'incoming' && direction !== 'outgoing') throw new InvalidToolInput('Supply incoming or outgoing direction.');
  if (tool === 'file_neighbours') return (repository: RepositoryResult) => repositoryQueries(repository).file_neighbours({ ...paging, path, direction });
  const depth = integer('depth', 2, 0, Number.MAX_SAFE_INTEGER);
  return (repository: RepositoryResult) => repositoryQueries(repository).walk_dependencies({ ...paging, path, direction, depth });
}
