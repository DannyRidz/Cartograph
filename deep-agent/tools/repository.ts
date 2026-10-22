import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repositoryQueries } from '../shared/lib/agent/queries.ts';
import type { RepositoryResult } from '../shared/lib/parser/types.ts';

const pageSchema = {
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().min(1).max(100).default(50),
};
const fileSchema = z.string().min(1).describe('Exact parsed file path returned by a lookup.');
const directionSchema = z.enum(['incoming', 'outgoing']).describe('incoming follows importers; outgoing follows dependencies.');

export const repositoryToolDefinitions = [
  {
      name: 'analysis_summary',
      description: 'Look up analysis counts, recorded roles and parser coverage, including skipped files. No source text or quality judgement.',
      schema: z.object({}).strict(),
  },
  {
      name: 'search_files',
      description: 'Find parsed files by a literal, case insensitive part of their path. Paginated; follow nextOffset for more. No semantic source search.',
      schema: z.object({ query: z.string().trim().min(1), ...pageSchema }).strict(),
  },
  {
      name: 'files_by_role',
      description: 'List files with an exact recorded role. Without a recorded role, use the parser kind. Unknown roles return no matches and the available roles.',
      schema: z.object({ role: z.string().min(1), ...pageSchema }).strict(),
  },
  {
      name: 'file_neighbours',
      description: 'Look up direct parsed import neighbours of an exact file. incoming means files importing it; outgoing means files it imports.',
      schema: z.object({ path: fileSchema, direction: directionSchema, ...pageSchema }).strict(),
  },
  {
      name: 'walk_dependencies',
      description: 'Use the canvas traversal to look up transitive parsed imports, sorted by shortest distance then path. The start is excluded. incoming gives potential dependents, not proof of runtime breakage. Default depth is two.',
      schema: z.object({ path: fileSchema, direction: directionSchema,
        depth: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(2), ...pageSchema }).strict(),
  },
  {
      name: 'route_table',
      description: 'List only routes whose method and full path were recovered by the parser adapter. Empty means none recovered, not necessarily no routes in the source.',
      schema: z.object(pageSchema).strict(),
  }
] as const;

export function createRepositoryTools(repository: RepositoryResult) {
  const queries = repositoryQueries(repository);
  return [
    tool(queries.analysis_summary, repositoryToolDefinitions[0]),
    tool(queries.search_files, repositoryToolDefinitions[1]),
    tool(queries.files_by_role, repositoryToolDefinitions[2]),
    tool(queries.file_neighbours, repositoryToolDefinitions[3]),
    tool(queries.walk_dependencies, repositoryToolDefinitions[4]),
    tool(queries.route_table, repositoryToolDefinitions[5])
  ] as const;
}
