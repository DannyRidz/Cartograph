import Link from "next/link";
import { Suspense } from "react";
import { AccountControl, TeamSwitcher } from "@/components/team-controls";
import { InviteControl } from "@/components/invite-control";
import { ThemeControl } from "@/components/theme-control";
import { requireOrganization } from "@/lib/organization";

async function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const organization = await requireOrganization();
  return (
    <div className="app-shell" key={organization.id}>
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <header className="app-header">
        <Link href="/workspace" className="brand">Cartograph</Link>
        <div className="team-switcher"><TeamSwitcher /></div>
        <nav className="header-controls" aria-label="Workspace controls">
          {organization.role === "org:admin" && <InviteControl key={organization.id} organizationId={organization.id} />}
          <ThemeControl />
          <AccountControl />
        </nav>
      </header>
      <div className="workspace-context">
        <span>Workspace</span>
        <code aria-label="Current organization">{organization.id}</code>
      </div>
      <div className="workspace-panels">
        <aside className="repository-panel" aria-labelledby="repositories-heading">
          <h2 id="repositories-heading" className="panel-heading">Repository</h2>
          <p className="empty-state">No repository loaded.</p>
        </aside>
        <main id="workspace" className="map-panel" tabIndex={-1}>{children}</main>
        <aside className="inspection-panel" aria-label="File details and repository questions">
          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="panel-heading">File details</h2>
            <p className="empty-state">No file selected.</p>
          </section>
          <section aria-labelledby="chat-heading">
            <h2 id="chat-heading" className="panel-heading">Repository questions</h2>
            <p className="empty-state">No repository loaded.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="loading-state" role="status">Loading workspace…</p>}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}
