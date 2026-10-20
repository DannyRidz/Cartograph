import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysis, getStoredRepository } from "@/lib/analyses";
import { requireOrganization } from "@/lib/organization";
import { progressSnapshot } from "@/lib/analysis-progress";
import { AnalysisProgress } from "@/components/analysis-progress";
import { DependencyCanvas } from "@/components/dependency-canvas";
import { WorkspacePanels } from "@/components/workspace-panels";
import { CoverageBanner } from "@/components/coverage-banner";
import { tracingConfigured } from "@/lib/ai/client";

async function Progress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await requireOrganization();
  const analysis = await getAnalysis(id);
  if (!analysis || analysis.is_seed) notFound();
  if (analysis.state === "completed") {
    const repository = await getStoredRepository(analysis);
    const name = analysis.projects?.repository_url.replace(/^https:\/\/github\.com\//, "") ?? "Repository";
    return <section className="analysis-map" aria-label={`${name} dependency map`}>
      <header className="analysis-map-heading">
        <Link className="analysis-link" href="/workspace">All analyses</Link>
        <h1><code>{name}</code></h1>
        {analysis.commit_sha && <span className="muted">Commit <code title={analysis.commit_sha}>{analysis.commit_sha.slice(0, 12)}</code></span>}
      </header>
      <CoverageBanner coverage={repository.coverage} />
      <DependencyCanvas key={`${organization.id}:${analysis.id}`} repository={repository} name={name}
        explanation={analysis.projects ? { analysisId: analysis.id, repositoryUrl: analysis.projects.repository_url, tracing: tracingConfigured() } : undefined} />
    </section>;
  }
  return <WorkspacePanels><AnalysisProgress key={`${organization.id}:${analysis.id}`} initial={progressSnapshot(analysis)}
    organizationId={organization.id} repository={analysis.projects?.repository_url ?? null}
    failedStage={analysis.failed_stage} commit={analysis.commit_sha} counts={analysis.coverage ? { files: analysis.coverage.filesParsed, skipped: analysis.coverage.filesSkipped } : null}
    evaluatedAt={analysis.evaluatedAt} /></WorkspacePanels>;
}

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className="empty-state" role="status">Loading analysis…</p>}><Progress params={params} /></Suspense>;
}
