import { readStoredRepository } from '@/lib/stored-repository';
import { foldRepository } from '@/lib/canvas/folding';
import { auth } from '@clerk/nextjs/server';
import { createDatabaseClient } from '@/lib/supabase';
import { analysisIdPattern } from '@/lib/agent/credential';
import { issueAgentCredential } from '@/lib/agent/issue';
import { allowAgentRequest } from '@/lib/agent/rate-limit';
import { conversationOwner, openAgentStream } from '@/lib/agent/runtime';
import { relayAgentStream } from '@/lib/agent/stream';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ message: 'A matching request origin is required.' }, { status: 403, headers });
  const { id } = await context.params;
  if (!analysisIdPattern.test(id)) return Response.json({ message: 'Invalid analysis.' }, { status: 400, headers });
  const session = await auth();
  if (!session.userId || !session.orgId) return Response.json({ message: 'Sign in with an active organization.' }, { status: 401, headers });
  if (!allowAgentRequest(`ask:${session.userId}:${session.orgId}`, 20)) return Response.json({ message: 'Too many questions. Try again in a minute.' }, { status: 429, headers });
  let input: { question: string; threadId?: string; selected: string | null };
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 16384) throw new Error();
    const text = await request.text();
    if (text.length > 16384) throw new Error();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || !('question' in body) || typeof body.question !== 'string'
      || !body.question.trim() || body.question.length > 4000) throw new Error();
    const threadId = 'threadId' in body && body.threadId !== null ? body.threadId : undefined;
    if (threadId !== undefined && (typeof threadId !== 'string' || !analysisIdPattern.test(threadId))) throw new Error();
    const selected = 'selected' in body ? body.selected : null;
    if (selected !== null && (typeof selected !== 'string' || selected.length > 4096)) throw new Error();
    input = { question: body.question.trim(), threadId, selected };
  } catch { return Response.json({ message: 'Supply a question of up to 4,000 characters and a valid conversation.' }, { status: 400, headers }); }
  const baseUrl = process.env.CARTOGRAPH_AGENT_URL;
  const ingressSecret = process.env.MDA_INGRESS_SECRET;
  if (!baseUrl || !ingressSecret) return Response.json({ message: 'Ask is not configured. The repository map is still available.' }, { status: 503, headers });
  const abort = new AbortController();
  const signal = AbortSignal.any([abort.signal, request.signal, AbortSignal.timeout(180_000)]);
  try {
    const database = await createDatabaseClient();
    const { data: analysis, error } = await database.from('analyses').select('id, organization_id, state, is_seed, schema_version, adapter, coverage').eq('id', id).maybeSingle();
    if (error) throw new Error('The analysis could not be read.');
    if (!analysis) return Response.json({ message: 'Analysis not found.' }, { status: 404, headers });
    if (analysis.state !== 'completed' || analysis.is_seed) return Response.json({ message: 'Ask needs a completed repository analysis.' }, { status: 409, headers });
    let selection: { kind: 'file' | 'folder'; path: string } | null = null;
    if (input.selected) {
      const file = await database.from('files').select('path').eq('analysis_id', id).eq('path', input.selected).limit(1);
      if (file.error) throw new Error('The selection could not be read.');
      if (file.data?.length) selection = { kind: 'file', path: input.selected };
      else {
        const repository = await readStoredRepository(database, analysis.id, analysis);
        if (!foldRepository(repository.files, repository.edges).modules.some((folder) => folder.id === input.selected)) return Response.json({ message: 'That selection is absent from this analysis.' }, { status: 400, headers });
        selection = { kind: 'folder', path: input.selected };
      }
    }
    const { credential } = await issueAgentCredential(database, analysis.id, analysis.organization_id);
    const stream = await openAgentStream({ baseUrl, ingressSecret,
      owner: conversationOwner(session.userId, analysis.organization_id, analysis.id),
      question: input.question, selection, credential, threadId: input.threadId, signal });
    return new Response(relayAgentStream(stream.body, stream.threadId, () => abort.abort()), {
      headers: { ...headers, 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' },
    });
  } catch (error: unknown) {
    abort.abort();
    return Response.json({ message: error instanceof Error && error.message.startsWith('This conversation')
      ? error.message : 'Ask is unavailable. Check that the agent is running, then try again.' }, { status: 503, headers });
  }
}
