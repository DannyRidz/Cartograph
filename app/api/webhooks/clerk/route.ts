import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { deleteOrganizationData } from "@/lib/organization-lifecycle";

export async function POST(request: NextRequest) {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim();
  if (!signingSecret) {
    console.error("Missing CLERK_WEBHOOK_SIGNING_SECRET. Set it in .env.local for the Clerk deletion webhook.");
    return new Response("Webhook is not configured.", { status: 500 });
  }
  let event;
  try {
    event = await verifyWebhook(request, { signingSecret });
  } catch {
    return new Response("Invalid webhook signature.", { status: 400 });
  }
  if (event.type !== "organization.deleted") return new Response(null, { status: 204 });
  const id = event.data.id;
  if (!id || !/^org_[A-Za-z0-9]+$/.test(id)) {
    return new Response("Missing or invalid organization ID.", { status: 400 });
  }
  try {
    await deleteOrganizationData(id);
  } catch (error) {
    console.error("Clerk organization deletion failed", error);
    return new Response("Organization data could not be deleted.", { status: 500 });
  }
  return new Response(null, { status: 204 });
}
