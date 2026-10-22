import { defineDeepAgent } from 'managed-deepagents';
import { createHttpTools, contextSchema } from './tools/http.ts';
import { createModel } from './model.ts';
import { lookupOnly } from './middleware/lookups.ts';

const tools = createHttpTools();
export const agent = defineDeepAgent({
  name: 'cartograph', model: createModel(), tools, contextSchema,
  middleware: [lookupOnly(tools.map((tool) => tool.name))], subagents: [],
});
