import type { ReactNode } from "react";

export function WorkspacePanels({ children }: { children: ReactNode }) {
  return <div className="workspace-panels">
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
  </div>;
}
