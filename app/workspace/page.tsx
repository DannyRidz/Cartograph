import { Suspense } from "react";
import { listAnalyses } from "@/lib/analyses";
import type { AnalysisState } from "@/lib/database.types";

const stateLabels: Record<AnalysisState, string> = {
  queued: "Queued",
  parsing: "Parsing",
  completed: "Completed",
  failed: "Failed",
};

async function Analyses() {
  const analyses = await listAnalyses();
  if (analyses.length === 0) {
    return (
      <div className="dashboard-empty">
        <p className="empty-title">No analyses yet.</p>
        <p className="muted">This team has not run an analysis.</p>
      </div>
    );
  }

  return (
    <section className="analysis-history" aria-label="Analysis history">
      <div className="analyses-toolbar">
        <p>Latest analyses <span className="analysis-count">{analyses.length} shown</span></p>
        <span className="muted">Newest first</span>
      </div>
      <div className="analyses-scroll">
        <table className="analyses-table">
          <caption>Up to 50 analyses. Seeded rows are demonstration data.</caption>
          <thead><tr><th scope="col">Repository</th><th scope="col">State</th><th scope="col">Created (UTC)</th></tr></thead>
          <tbody>
            {analyses.map((analysis) => (
              <tr key={analysis.id}>
                <td>
                  <div className="analysis-repository">
                    {analysis.projects ? <code title={analysis.projects.repository_url}>{analysis.projects.repository_url.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "")}</code> : <span className="muted">Repository unavailable</span>}
                    {analysis.is_seed && <span className="seed-label">Seeded</span>}
                  </div>
                  <div className="analysis-reference"><span>Analysis</span> <code title={analysis.id}>{analysis.id.slice(0, 8)}</code></div>
                </td>
                <td><span className="analysis-state" data-state={analysis.state}>{stateLabels[analysis.state]}</span></td>
                <td className="analysis-date"><time dateTime={analysis.created_at}>{new Date(analysis.created_at).toISOString().slice(0, 16).replace("T", " ")}</time></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function WorkspacePage() {
  return (
    <>
      <header className="dashboard-heading">
        <h1>Analyses</h1>
        <p>Repository analysis history for the active team.</p>
      </header>
      <Suspense fallback={<p className="empty-state" role="status">Loading analyses…</p>}>
        <Analyses />
      </Suspense>
    </>
  );
}
