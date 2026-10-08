import "server-only";
import { auth } from "@clerk/nextjs/server";

export async function requireOrganization() {
  const session = await auth.protect();
  if (!session.orgId) {
    throw new Error("No active organization. In Clerk Organizations settings, require membership and enable Create first organization automatically.");
  }
  return { id: session.orgId, role: session.orgRole, userId: session.userId };
}
