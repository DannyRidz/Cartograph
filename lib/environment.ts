function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing ${name}. Set it in .env.local before starting Cartograph.`);
  }
  return value.trim();
}

export function getEnvironment() {
  const clerkPublishableKey = required(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );
  const clerkSecretKey = required("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY);
  const supabaseUrl = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const supabasePublishableKey = required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP or HTTPS URL.");
  }
  return { clerkPublishableKey, clerkSecretKey, supabaseUrl, supabasePublishableKey };
}
