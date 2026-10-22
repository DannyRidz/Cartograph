import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { registerAgentCredential } from './grant';
import { signingSecret } from './database';

export async function issueAgentCredential(database: SupabaseClient<Database>, analysisId: string, organizationId: string) {
  return registerAgentCredential(database, analysisId, organizationId, signingSecret());
}
