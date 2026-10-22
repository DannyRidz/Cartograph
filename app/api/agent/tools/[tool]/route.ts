import { createAgentDatabaseClient, signingSecret } from '@/lib/agent/database';
import { allowAgentRequest } from '@/lib/agent/rate-limit';
import { verifyCredential, credentialHash } from '@/lib/agent/credential';
import { InvalidToolInput, prepareRepositoryQuery } from '@/lib/agent/queries';
import { readStoredRepository } from '@/lib/stored-repository';

export async function GET(request: Request, context: { params: Promise<{ tool: string }> }) {
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return Response.json({ message: 'An agent credential is required.' }, { status: 401, headers });
  let secret: string;
  try { secret = signingSecret(); }
  catch { return Response.json({ message: 'Agent tool credentials are not configured.' }, { status: 503, headers }); }
  const token = bearer.slice(7);
  let claims;
  try { claims = verifyCredential(token, secret); }
  catch { return Response.json({ message: 'Invalid or expired agent credential.' }, { status: 401, headers }); }
  if (!allowAgentRequest(`tool:${credentialHash(token)}`, 120)) return Response.json({ message: 'Too many tool requests.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  if (request.url.length > 16384) return Response.json({ message: 'Tool request is too large.' }, { status: 414, headers });
  let query;
  try { query = prepareRepositoryQuery((await context.params).tool, new URL(request.url).searchParams); }
  catch (error: unknown) {
    if (error instanceof InvalidToolInput) return Response.json({ message: error.message }, { status: 400, headers });
    throw error;
  }
  try {
    const database = createAgentDatabaseClient(token);
    // Intentionally unfiltered: RLS must return exactly the credential's scope.
    const { data: analysis, error } = await database.from('analyses')
      .select('id, organization_id, state, is_seed, schema_version, adapter, coverage').limit(2);
    if (error) throw new Error('Could not read agent analysis.');
    if (!analysis?.length) return Response.json({ message: 'Agent grant is unavailable or expired.' }, { status: 401, headers });
    const row = analysis[0];
    if (analysis.length !== 1 || row.id !== claims.analysisId || row.organization_id !== claims.organizationId) throw new Error('Agent grant scope did not match database policy.');
    const repository = await readStoredRepository(database, row.id, row);
    return Response.json(query(repository), { headers });
  } catch {
    console.error('Agent tool read failed. Check database connectivity and agent scope policies.');
    return Response.json({ message: 'The analysis could not be read.' }, { status: 503, headers });
  }
}
