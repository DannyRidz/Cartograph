"use client";

import { insightSentences, type repositoryInsights } from "@/lib/canvas/insights";

interface InsightsProps {
  insights: ReturnType<typeof repositoryInsights>;
  select: (path: string) => void;
  hover: (path: string | null) => void;
}

/** Renders initially collapsed graph facts with paths that select and highlight canvas files. */
export function RepositoryInsights({ insights, select, hover }: InsightsProps) {
  const pathButton = (path: string, count?: number) => <button className="detail-path" onClick={() => select(path)} onMouseEnter={() => hover(path)} onMouseLeave={() => hover(null)} onFocus={() => hover(path)} onBlur={() => hover(null)}>
    <code>{path}</code>{count !== undefined && <span>{count}</span>}
  </button>;
  return <details className="repository-insights detail-section">
    <summary>Insights</summary>
    <section className="detail-section"><h3>Files nothing imports <span>{insights.unimported.length}</span></h3>
      <p className="detail-note">Conventional framework entry points and recognized config files are excluded. This does not establish whether a file is used outside the parsed imports.</p>
      {insights.unimported.length ? <ul className="detail-paths">{insights.unimported.map((path) => <li key={path}><p className="insight-sentence">{insightSentences.unimported}</p>{pathButton(path)}</li>)}</ul> : <p className="detail-note">None.</p>}
    </section>
    <section className="detail-section"><h3>Many importers <span>{insights.popular.length}</span></h3>
      <p className="detail-note">At least 10 distinct importers and above mean + 2 standard deviations ({insights.threshold.toFixed(2)} importers).</p>
      {insights.popular.length ? <ul className="detail-paths">{insights.popular.map(({ path, count }) => <li key={path}><p className="insight-sentence">{insightSentences.popular}</p>{pathButton(path, count)}</li>)}</ul> : <p className="detail-note">None.</p>}
    </section>
    <section className="detail-section"><h3>Import cycles <span>{insights.cycles.length}</span></h3>
      <p className="detail-note">One closed import path per cyclic group. Each file imports the next, and the last repeats the first.</p>
      {insights.cycles.length ? insights.cycles.map((cycle) => <div className="insight-cycle" key={cycle.files[0]}>
        <p className="insight-sentence">{insightSentences.cycle}</p>
        <ol className="detail-paths">{cycle.path.map((path, index) => <li key={`${index}:${path}`}>{pathButton(path)}</li>)}</ol>
        <details><summary>All {cycle.files.length} files in this cyclic group</summary><ul className="detail-paths">{cycle.files.map((path) => <li key={path}>{pathButton(path)}</li>)}</ul></details>
      </div>) : <p className="detail-note">None.</p>}
    </section>
    <section className="detail-section"><h3>Over 500 lines <span>{insights.long.length}</span></h3>
      {insights.long.length ? <ul className="detail-paths">{insights.long.map(({ path, count }) => <li key={path}><p className="insight-sentence">{insightSentences.long}</p>{pathButton(path, count)}</li>)}</ul> : <p className="detail-note">None.</p>}
    </section>
  </details>;
}
