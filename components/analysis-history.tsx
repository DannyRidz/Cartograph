"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { listAnalyses } from "@/lib/analyses";
import { isStale, progressSnapshot, stageLabels } from "@/lib/analysis-progress";
import { useLiveProgress } from "@/components/use-live-progress";

type History = Awaited<ReturnType<typeof listAnalyses>>;

export function AnalysisHistory({ analyses, organizationId, evaluatedAt }: { analyses: History; organizationId: string; evaluatedAt: number }) {
  const { progress, connectionError } = useLiveProgress(analyses.filter((row) => !row.is_seed).map(progressSnapshot), organizationId, true);
  const [now, setNow] = useState(evaluatedAt);
  useEffect(() => {
    // This timer only ages the local stale label. It never reads the database.
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const byId = new Map(progress.map((item) => [item.id, item]));

  return <>
    {connectionError && <p className="progress-notice" role="alert">{connectionError}</p>}
    {analyses.length === 0 ? <div className="dashboard-empty"><p className="empty-title">No analyses yet.</p><p className="muted">Submit a public GitHub repository to start.</p></div> :
      <section className="analysis-history" aria-label="Analysis history">
        <div className="analyses-toolbar"><p>Latest analyses <span className="analysis-count">{analyses.length} shown</span></p><span className="muted">Newest first</span></div>
        <div className="analyses-scroll">
          <table className="analyses-table">
            <caption>Up to 50 analyses. Seeded rows are demonstration data.</caption>
            <thead><tr><th scope="col">Repository</th><th scope="col">State</th><th scope="col">Created (UTC)</th></tr></thead>
            <tbody>{analyses.map((analysis) => {
              const current = byId.get(analysis.id) ?? progressSnapshot(analysis);
              const stale = isStale(current, now);
              const repository = analysis.projects?.repository_url.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
              return <tr key={analysis.id}>
                <td><div className="analysis-repository">
                  {repository ? analysis.is_seed ? <code>{repository}</code> : <Link href={`/workspace/analyses/${analysis.id}`} className="analysis-link"><code>{repository}</code></Link> : <span className="muted">Repository unavailable</span>}
                  {analysis.is_seed && <span className="seed-label">Seeded</span>}
                </div><div className="analysis-reference"><span>Analysis</span> <code title={analysis.id}>{analysis.id.slice(0, 8)}</code></div></td>
                <td><span className="analysis-state" data-state={current.stage === "failed" || current.stage === "completed" ? current.stage : "parsing"}>
                  {stale ? `Stale · ${stageLabels[current.stage]}` : stageLabels[current.stage]}
                </span>{!analysis.is_seed && <p className="analysis-message">{current.message}</p>}</td>
                <td className="analysis-date"><time dateTime={analysis.created_at}>{new Date(analysis.created_at).toISOString().slice(0, 16).replace("T", " ")}</time></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>}
  </>;
}
