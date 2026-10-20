"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Explanation } from "@/lib/ai/types";
import { ExplanationProse } from "./explanation-prose";

type Entry = { result?: Explanation; pending?: boolean; error?: string };
export interface ExplanationContext { analysisId: string; repositoryUrl: string; tracing: boolean }

export function ExplanationPane({ context, target, kind, select }: {
  context?: ExplanationContext; target: string | null; kind: "file" | "folder"; select: (path: string) => void;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const active = useRef(new Set<string>());
  const [reanalysing, setReanalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>();
  const router = useRouter();
  const key = JSON.stringify([context?.analysisId, kind, target]);
  const entry = entries[key];
  async function fetchExplanation() {
    if (!context || !target || active.current.has(key)) return;
    active.current.add(key);
    setEntries((current) => ({ ...current, [key]: { ...current[key], pending: true, error: undefined } }));
    try {
      const response = await fetch("/api/explanations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisId: context.analysisId, target, kind }) });
      if (!response.ok) {
        const error: unknown = await response.json();
        throw new Error(error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Could not explain this selection.");
      }
      const result: Explanation = await response.json();
      setEntries((current) => ({ ...current, [key]: { result } }));
    } catch (error: unknown) {
      setEntries((current) => ({ ...current, [key]: { ...current[key], pending: false, error: error instanceof Error ? error.message : "Could not explain this selection." } }));
    } finally { active.current.delete(key); }
  }
  async function reanalyse() {
    if (!context || reanalysing) return;
    setReanalysing(true);
    setAnalysisError(undefined);
    try {
      const response = await fetch("/api/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repositoryUrl: context.repositoryUrl, reanalyse: true }) });
      const value: unknown = await response.json();
      if (!response.ok || !value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") throw new Error("Could not start a fresh analysis.");
      router.push(`/workspace/analyses/${value.id}`);
    } catch (error: unknown) {
      setAnalysisError(error instanceof Error ? error.message : "Could not start a fresh analysis.");
      setReanalysing(false);
    }
  }
  return <>
    <p className="detail-note">{context?.tracing ? "LangSmith tracing configured." : "Tracing is unconfigured. Explanations still work without recording runs."}</p>
    {!context ? <p className="detail-note">Open a stored analysis to explain files and folders.</p> : !target ? <p className="detail-note">Select a file or folder, then click Explain.</p> : <>
      <p className="detail-folder"><code>{target}</code></p>
      <div className="graph-actions"><button type="button" disabled={entry?.pending} onClick={() => void fetchExplanation()}>Explain</button></div>
      {entry?.pending && <p className="detail-note" role="status">{entry.result ? "Checking the repository and cache…" : "Checking the repository and explaining…"}</p>}
      {entry?.error && <p className="form-error" role="alert">{entry.error}</p>}
      {entry?.result && <>
        {entry.result.stale && <div className="explanation-stale" role="status"><p>Stale explanation. {entry.result.stale} This describes the analysed commit.</p><button type="button" disabled={reanalysing} onClick={() => void reanalyse()}>{reanalysing ? "Starting analysis…" : "Re-analyse"}</button></div>}
        {analysisError && <p className="form-error" role="alert">{analysisError}</p>}
        <ExplanationProse body={entry.result.body} paths={entry.result.paths} select={select} />
        <p className="detail-note">{entry.result.cached ? "Cached explanation" : "Explanation saved"} · <code>{entry.result.model}</code><br />Repository checked {new Date(entry.result.checkedAt).toLocaleString()}</p>
      </>}
    </>}
  </>;
}
