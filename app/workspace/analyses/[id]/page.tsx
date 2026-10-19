import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAnalysis } from "@/lib/analyses";
import { requireOrganization } from "@/lib/organization";
import { progressSnapshot } from "@/lib/analysis-progress";
import { AnalysisProgress } from "@/components/analysis-progress";

async function Progress({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await requireOrganization();
  const analysis = await getAnalysis(id);
  if (!analysis || analysis.is_seed) notFound();
  return <AnalysisProgress key={`${organization.id}:${analysis.id}`} initial={progressSnapshot(analysis)}
    organizationId={organization.id} repository={analysis.projects?.repository_url ?? null}
    failedStage={analysis.failed_stage} commit={analysis.commit_sha} counts={analysis.coverage ? { files: analysis.coverage.filesParsed, skipped: analysis.coverage.filesSkipped } : null}
    evaluatedAt={analysis.evaluatedAt} />;
}

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className="empty-state" role="status">Loading analysis…</p>}><Progress params={params} /></Suspense>;
}
