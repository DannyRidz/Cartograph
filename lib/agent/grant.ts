import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types.ts';
import { credentialHash, signCredential } from './credential.ts';

export async function registerAgentCredential(database: SupabaseClient<Database>, analysisId: string, organizationId: string, secret: string) {
  // The grant and signed claims use one clock. App clock skew must not make the
  // expiry exceed either of the database's five minute bounds.
  const clock = await database.rpc('agent_credential_time');
  const now = typeof clock.data === 'string' ? Date.parse(clock.data) : NaN;
  if (clock.error || !Number.isFinite(now)) throw new Error('Could not read agent credential time.');
  const { token, claims } = signCredential(analysisId, organizationId, secret, now);
  const expiresAt = new Date(claims.expiresAt * 1000).toISOString();
  const registered = await database.from('agent_tool_grants').insert({ token_hash: credentialHash(token),
    organization_id: organizationId, analysis_id: analysisId,
    created_at: new Date(claims.issuedAt * 1000).toISOString(), expires_at: expiresAt });
  if (registered.error) throw new Error('Could not register agent credential.');
  return { credential: token, expiresAt };
}
