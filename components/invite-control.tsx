"use client";

import { useActionState } from "react";
import { inviteMember, type InvitationState } from "@/app/workspace/actions";

const initialState: InvitationState = { status: "idle", message: "" };

export function InviteControl({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(inviteMember, initialState);
  return (
    <details className="invite-control">
      <summary>Invite</summary>
      <form action={action} className="invite-form">
        <h2>Invite to this team</h2>
        <input type="hidden" name="organizationId" value={organizationId} />
        <label htmlFor="invite-email">Email address</label>
        <input id="invite-email" name="email" type="email" autoComplete="email" maxLength={254} required />
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button>
        {state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
      </form>
    </details>
  );
}
