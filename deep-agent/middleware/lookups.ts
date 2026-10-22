import { createMiddleware } from 'langchain';

export function lookupOnly(names: string[]) {
  const allowed = new Set(names);
  return createMiddleware({
    name: 'RepositoryLookupsOnly',
    wrapModelCall: async (request, handler) => {
      const messages = request.messages;
      const lastUser = messages.findLastIndex((message) => message.type === 'human');
      const lookedUp = messages.slice(lastUser + 1).some((message) =>
        message.type === 'tool' && message.name !== undefined && allowed.has(message.name));
      const response = await handler({ ...request,
        tools: request.tools.filter((tool) => 'name' in tool && typeof tool.name === 'string' && allowed.has(tool.name)),
        toolChoice: lookedUp ? 'auto' : 'required',
      });
      if (!lookedUp && !response.tool_calls?.length) {
        throw new Error('The model returned an answer without a repository lookup.');
      }
      return response;
    },
    wrapToolCall: (request, handler) => {
      if (!allowed.has(request.toolCall.name)) throw new Error('Only repository lookups are available.');
      return handler(request);
    },
  });
}
