"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStage } from "@/lib/database.types";
import { isStale, runStages, stageLabels, type ProgressSnapshot } from "@/lib/analysis-progress";
import { useLiveProgress } from "@/components/use-live-progress";

export function AnalysisProgress({ initial, organizationId, repository, commit, counts, failedStage, evaluatedAt }: {
  initial: ProgressSnapshot; organizationId: string; repository: string | null; commit: string | null;
  counts: { files: number; skipped: number } | null; failedStage: PipelineStage | null; evaluatedAt: number;
}) {
  const { progress, connectionError } = useLiveProgress([initial], organizationId);
  const current = progress[0];
  const router = useRouter();
  const [now, setNow] = useState(evaluatedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // Fetch completion metadata once, after its transaction has committed.
    if ((current.stage === "completed" || current.stage === "failed") && current.stage !== initial.stage) router.refresh();
  }, [current.stage, initial.stage, router]);
  const stale = isStale(current, now);
  const stageIndex = current.stage === "completed" ? runStages.length : runStages.findIndex((stage) => stage === (current.stage === "failed" ? failedStage : current.stage));

  return <section className="analysis-progress" aria-labelledby="progress-title">
    <Link className="analysis-link" href="/workspace">All analyses</Link>
    <h1 id="progress-title">{current.stage === "completed" ? "Analysis complete" : current.stage === "failed" ? "Analysis failed" : "Repository analysis"}</h1>
    {repository && <p className="progress-repository"><code>{repository.replace(/^https:\/\/github\.com\//, "")}</code></p>}
    <ol className="progress-stages" aria-label="Analysis stages">
      {runStages.map((stage, index) => <li key={stage} data-state={index < stageIndex ? "complete" : index === stageIndex ? current.stage === "failed" ? "failed" : "current" : "waiting"}
        aria-current={current.stage === stage ? "step" : undefined}>
        <span>{stageLabels[stage]}</span><span className="muted">{index < stageIndex ? "Done" : current.stage === stage ? "In progress" : current.stage === "failed" && stage === failedStage ? "Failed" : ""}</span>
      </li>)}
    </ol>
    <p className="progress-message" role={current.stage === "failed" ? "alert" : "status"}>{current.message}</p>
    {stale && <p className="progress-notice" role="status">Stale run. No stage change for over five minutes. The process may have stopped.</p>}
    {connectionError && <p className="progress-notice" role="alert">{connectionError}</p>}
    {commit && <p className="muted">Commit <code>{commit}</code></p>}
    {counts && current.stage === "completed" && <p className="muted">{counts.files} files parsed · {counts.skipped} skipped</p>}
    <p className="muted">Analysis <code>{initial.id}</code></p>
  </section>;
}
