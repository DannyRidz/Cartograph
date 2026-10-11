"use client";

import { useState } from "react";
import type { RepositoryResult } from "@/lib/parser/types";
import type { FoldedModule } from "@/lib/canvas/folding";
import type { repositoryDetails } from "@/lib/canvas/details";
import { walkGraph, type GraphIndex, type Direction } from "@/lib/canvas/graph";
import type { repositoryInsights } from "@/lib/canvas/insights";
import { RepositoryInsights } from "@/components/repository-insights";

interface DetailsProps {
  name: string;
  repository: RepositoryResult;
  details: ReturnType<typeof repositoryDetails>;
  folder: FoldedModule | undefined;
  selected: string | null;
  highlighted: Set<string>;
  select: (path: string) => void;
  hover: (path: string | null) => void;
  graph: GraphIndex;
  insights: ReturnType<typeof repositoryInsights>;
}

/** Shows repository, folder, or file details with two-level graph walks and shared insights. */
export function RepositoryDetails({ name, repository, details, folder, selected, highlighted, select, hover, graph, insights }: DetailsProps) {
  const [tab, setTab] = useState<"structure" | "explanation">("structure");
  const [walk, setWalk] = useState<{ path: string; direction: Direction } | null>(null);
  const file = selected === null ? undefined : details.files.get(selected);
  const traversal = file && walk?.path === selected ? walkGraph(graph, file.file.path, walk.direction) : null;
  const pathButton = (path: string, count?: number) => <button className={`detail-path${highlighted.has(path) ? " is-highlighted" : ""}`} onClick={() => select(path)} onMouseEnter={() => hover(path)} onMouseLeave={() => hover(null)} onFocus={() => hover(path)} onBlur={() => hover(null)}>
    <code>{path}</code>{count !== undefined && <span>{count}</span>}
  </button>;
  const paths = (title: string, entries: string[]) => <section className="detail-section"><h3>{title} <span>{entries.length}</span></h3>
    {entries.length ? <ul className="detail-paths">{entries.map((path) => <li key={path}>{pathButton(path)}</li>)}</ul> : <p className="detail-note">None.</p>}
  </section>;
  const kinds = folder ? (["module", "script"] as const).map((kind) => ({ kind, count: folder.files.filter((member) => member.kind === kind).length })).filter(({ count }) => count > 0) : [];
  return <div className="repository-details">
    <h2 className="panel-heading">{selected === null ? "Repository" : file ? "File" : "Folder"}</h2>
    <div className="detail-tabs" role="tablist" aria-label="Details" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "structure" : event.key === "End" ? "explanation" : tab === "structure" ? "explanation" : "structure";
      setTab(next);
      document.getElementById(`detail-tab-${next}`)?.focus();
    }}>
      {(["structure", "explanation"] as const).map((value) => <button key={value} id={`detail-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`detail-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{value === "structure" ? "Structure" : "Explanation"}</button>)}
    </div>
    <div className="detail-content" id={`detail-panel-${tab}`} role="tabpanel" aria-labelledby={`detail-tab-${tab}`} tabIndex={0}>
      {tab === "explanation" ? <p className="detail-note">No explanation yet. Explanations will appear here when model calls are available.</p> : file ? <>
        {pathButton(file.file.path)}
        <dl className="detail-facts"><dt>Kind</dt><dd>{file.file.kind}</dd><dt>Lines</dt><dd>{file.file.lineCount}</dd><dt>Dependencies</dt><dd>{file.imports.length}</dd><dt>Dependents</dt><dd>{file.dependents.length}</dd></dl>
        {paths("Depends on", file.imports)}{paths("Depended on by", file.dependents)}
        <section className="detail-section"><div className="graph-actions">
          <button aria-pressed={traversal !== null && walk?.direction === "incoming"} onClick={() => setWalk({ path: file.file.path, direction: "incoming" })}>Blast radius</button>
          <button aria-pressed={traversal !== null && walk?.direction === "outgoing"} onClick={() => setWalk({ path: file.file.path, direction: "outgoing" })}>Dependency chain</button>
        </div><p className="detail-note">Up to two import levels. The number beside each path is its shortest import distance.</p>
          {traversal !== null && <><h3>{walk?.direction === "incoming" ? "Blast radius" : "Dependency chain"} <span>{traversal.length}</span></h3>
            {traversal.length ? <ul className="detail-paths">{traversal.map(({ path, depth }) => <li key={path}>{pathButton(path, depth)}</li>)}</ul> : <p className="detail-note">None within two import levels.</p>}
          </>}
        </section>
      </> : folder ? <>
        <p className="detail-folder"><code>{folder.id}</code></p>
        <dl className="detail-facts"><dt>Files</dt><dd>{folder.files.length}</dd>{kinds.map(({ kind, count }) => <div className="detail-fact" key={kind}><dt>{kind === "module" ? "Modules" : "Scripts"}</dt><dd>{count}</dd></div>)}</dl>
        {paths("Files in folder", folder.files.map((member) => member.path))}
      </> : <>
        <p className="detail-name">{name}</p>
        <dl className="detail-facts"><dt>Framework</dt><dd>Not detected</dd><dt>Files</dt><dd>{repository.files.length}</dd><dt>Imports seen</dt><dd>{repository.coverage.imports.length}</dd><dt>Routes</dt><dd>Not available</dd><dt>Unidentified by convention</dt><dd>{repository.files.length}</dd></dl>
        <p className="detail-note">The fallback adapter identifies modules and scripts. It has no framework, route, or file convention detection.</p>
        <section className="detail-section"><h3>Most depended on <span>{details.mostImported.length}</span></h3><p className="detail-note">Ranked by distinct importing files.</p>{details.mostImported.length ? <ol className="detail-paths">{details.mostImported.map((item) => <li key={item.file.path}>{pathButton(item.file.path, item.dependents.length)}</li>)}</ol> : <p className="detail-note">No files have dependents.</p>}</section>
        <section className="detail-section"><h3>Where to start reading <span>{details.entryFiles.length}</span></h3><p className="detail-note">Nothing imports these files. Ranked by dependency count.</p>{details.entryFiles.length ? <ol className="detail-paths">{details.entryFiles.map((item) => <li key={item.file.path}>{pathButton(item.file.path, item.imports.length)}</li>)}</ol> : <p className="detail-note">Every file has dependents.</p>}</section>
      </>}
    </div>
    {tab === "structure" && <RepositoryInsights insights={insights} select={select} hover={hover} />}
  </div>;
}
