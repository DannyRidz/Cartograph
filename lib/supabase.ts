import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { getEnvironment } from "@/lib/environment";
import type { Database } from "@/lib/database.types";

export async function createDatabaseClient() {
  const session = await auth.protect();
  if (!session.orgId) {
    throw new Error("A database client requires an active organization.");
  }
  // With no template, Clerk returns the verified request token without an API call.
  const token = await session.getToken();
  if (!token) throw new Error("The signed-in Clerk session token is missing.");
  const { supabaseUrl, supabasePublishableKey } = getEnvironment();

  // A fresh client belongs to this request, never a process-wide session.
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    accessToken: async () => token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
