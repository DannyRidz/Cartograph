import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getEnvironment } from "@/lib/environment";

export async function deleteOrganizationData(organizationId: string) {
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY. Set it in .env.local for the Clerk deletion webhook.");
  const { supabaseUrl } = getEnvironment();
  // Only the verified webhook calls this client. Session reads never use it.
  const database = createClient<Database>(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await database.from("organizations").delete().eq("id", organizationId);
  if (error) throw new Error("Organization data deletion failed.", { cause: error });
}
