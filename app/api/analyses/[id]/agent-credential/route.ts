import { allowAgentRequest } from '@/lib/agent/rate-limit';
import { auth } from '@clerk/nextjs/server';
import { createDatabaseClient } from '@/lib/supabase';
import { analysisIdPattern } from '@/lib/agent/credential';
import { issueAgentCredential } from '@/lib/agent/issue';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ message: 'A matching request origin is required.' }, { status: 403, headers });
  const { id } = await context.params;
  if (!analysisIdPattern.test(id)) return Response.json({ message: 'Invalid analysis.' }, { status: 400, headers });
  const session = await auth();
  if (!session.userId || !session.orgId) return Response.json({ message: 'Sign in with an active organization.' }, { status: 401, headers });
  if (!allowAgentRequest(`issue:${session.userId}:${session.orgId}`, 20)) return Response.json({ message: 'Too many credential requests.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  try {
    const database = await createDatabaseClient();
    const { data: analysis, error } = await database.from('analyses').select('id, organization_id, state, is_seed').eq('id', id).maybeSingle();
    if (error) throw new Error('Could not read analysis.');
    if (!analysis) return Response.json({ message: 'Analysis not found.' }, { status: 404, headers });
    if (analysis.state !== 'completed' || analysis.is_seed) return Response.json({ message: 'A completed repository analysis is required.' }, { status: 409, headers });
    return Response.json(await issueAgentCredential(database, analysis.id, analysis.organization_id), { headers });
  } catch {
    console.error('Agent credential issuance failed. Check signing configuration and the agent grant migration.');
    return Response.json({ message: 'Could not issue the agent credential.' }, { status: 500, headers });
  }
}
