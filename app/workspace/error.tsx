"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <div className="dashboard-empty" role="alert">
      <h1 className="panel-heading">Analyses unavailable</h1>
      <p>The analyses could not be loaded. Check the server log and database setup.</p>
      <button className="retry-button" onClick={reset}>Try again</button>
    </div>
  );
}
