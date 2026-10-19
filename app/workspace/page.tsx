import { Suspense } from "react";
import { getDashboardSnapshot } from "@/lib/analyses";
import { requireOrganization } from "@/lib/organization";
import { AnalysisForm } from "@/components/analysis-form";
import { AnalysisHistory } from "@/components/analysis-history";

async function Analyses() {
  const organization = await requireOrganization();
  const { analyses, evaluatedAt } = await getDashboardSnapshot();
  return <AnalysisHistory key={`${organization.id}:${analyses.map((row) => row.id).join(",")}`}
    analyses={analyses} organizationId={organization.id} evaluatedAt={evaluatedAt} />;
}

export default function WorkspacePage() {
  return <>
    <header className="dashboard-heading"><h1>Analyses</h1><p>Repository analysis history for the active team.</p></header>
    <AnalysisForm />
    <Suspense fallback={<p className="empty-state" role="status">Loading analyses…</p>}><Analyses /></Suspense>
  </>;
}
