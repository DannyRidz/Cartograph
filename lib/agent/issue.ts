import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { credentialHash, signCredential } from './credential';
import { signingSecret } from './database';

export async function issueAgentCredential(database: SupabaseClient<Database>, analysisId: string, organizationId: string) {
  const { token, claims } = signCredential(analysisId, organizationId, signingSecret());
  const expiresAt = new Date(claims.expiresAt * 1000).toISOString();
  const registered = await database.from('agent_tool_grants').insert({ token_hash: credentialHash(token),
    organization_id: organizationId, analysis_id: analysisId, expires_at: expiresAt });
  if (registered.error) throw new Error('Could not register agent credential.');
  return { credential: token, expiresAt };
}
