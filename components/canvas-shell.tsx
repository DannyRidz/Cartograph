import type { ReactNode } from "react";

export function CanvasShell({ children, rail, details }: { children?: ReactNode; rail?: ReactNode; details?: ReactNode }) {
  return (
    <div className="canvas-shell">
      <aside className="canvas-rail" aria-labelledby="categories-heading">
        {rail ?? <><h2 id="categories-heading" className="panel-heading">File categories</h2><p className="empty-state">No repository loaded.</p></>}
      </aside>
      <main id="canvas" className="canvas-map" aria-label="Dependency map" tabIndex={-1}>
        {children}
      </main>
      <aside className="canvas-details" aria-label="Repository details">{details}</aside>
    </div>
  );
}
