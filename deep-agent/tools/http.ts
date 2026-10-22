import { tool, type ToolRuntime } from '@langchain/core/tools';
import { z } from 'zod';
import { repositoryToolDefinitions } from './repository.ts';

// Runtime context is separate from messages, checkpointed state and tool schemas.
export const contextSchema = z.object({ credential: z.string().min(1) });
export function createHttpTools() {
  return repositoryToolDefinitions.map((definition) => tool(async (args: unknown, runtime: ToolRuntime<unknown, typeof contextSchema>) => {
    const credential = runtime.context?.credential;
    const configured = process.env.CARTOGRAPH_APP_URL;
    if (!credential || !configured) throw new Error('Repository access is unavailable.');
    const base = new URL(configured);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Repository access is not configured.');
    const url = new URL(`/api/agent/tools/${definition.name}`, base);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid lookup arguments.');
    for (const [key, value] of Object.entries(args)) {
      if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Invalid lookup argument.');
      url.searchParams.set(key, String(value));
    }
    const id = runtime.toolCallId;
    runtime.writer?.({ type: 'tool', id, name: definition.name, args, status: 'running' });
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${credential}` },
        signal: runtime.signal ? AbortSignal.any([runtime.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000), redirect: 'error' });
      if (!response.ok) throw new Error('The repository lookup is unavailable or its access has expired.');
      const result: unknown = await response.json();
      runtime.writer?.({ type: 'tool', id, name: definition.name, args, status: 'complete' });
      return result;
    } catch {
      runtime.writer?.({ type: 'tool', id, name: definition.name, args, status: 'failed' });
      throw new Error('The repository lookup failed. Try asking again.');
    }
  }, definition));
}
