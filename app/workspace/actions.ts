"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { requireOrganization } from "@/lib/organization";

export type InvitationState = { status: "idle" | "success" | "error"; message: string };

export async function inviteMember(_previous: InvitationState, form: FormData): Promise<InvitationState> {
  const organization = await requireOrganization();
  if (organization.role !== "org:admin") {
    return { status: "error", message: "Only a team admin can invite members." };
  }
  if (form.get("organizationId") !== organization.id) {
    return { status: "error", message: "Your team changed. Reopen Invite and try again." };
  }
  const email = form.get("email");
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { status: "error", message: "Enter a valid email address." };
  }
  // Next validates a Server Action's Origin against its host before calling it.
  const origin = (await headers()).get("origin");
  if (!origin) throw new Error("The invitation request is missing its origin.");
  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: organization.id,
      inviterUserId: organization.userId,
      emailAddress: email.trim(),
      role: "org:member",
      redirectUrl: new URL("/sign-in", origin).toString(),
    });
    return { status: "success", message: `Invitation sent to ${email.trim()}.` };
  } catch (error) {
    console.error("Clerk organization invitation failed", error);
    return { status: "error", message: "The invitation could not be sent. Please try again." };
  }
}
