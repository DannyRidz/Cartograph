import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { getEnvironment } from '../environment';

export function signingSecret() {
  const secret = process.env.CARTOGRAPH_AGENT_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Set CARTOGRAPH_AGENT_SIGNING_SECRET to at least 32 random bytes in .env.local.');
  return secret;
}
export function createAgentDatabaseClient(token: string) {
  const { supabaseUrl, supabasePublishableKey } = getEnvironment();
  // No Clerk session or privileged key. PostgREST's anon role receives only the
  // registered capability; RLS still scopes an unfiltered query to its analysis.
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    global: { headers: { 'x-cartograph-agent-token': token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
