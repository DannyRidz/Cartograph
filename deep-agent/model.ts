import { ChatOpenAI } from '@langchain/openai';

// LangChain starts the model trace before reading this process local cache.
// Hits remain recorded model runs, with cached=true and no provider request.
export function createModel() {
  return new ChatOpenAI({ model: 'gpt-5.5', useResponsesApi: true, cache: true,
    timeout: 60_000, maxRetries: 1 });
}
