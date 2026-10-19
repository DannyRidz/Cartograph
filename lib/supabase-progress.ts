"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Clerk's getToken reads the current session (including its readable access token
// cookie). Realtime calls it on each heartbeat. Bypass Clerk's token cache so
// a token near expiry cannot expire before the next heartbeat.
export function createProgressClient(getToken: (options: { skipCache: true }) => Promise<string | null>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createClient<Database>(url, key, {
    accessToken: async () => {
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("Your sign in session is missing. Sign in again to receive progress.");
      return token;
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
