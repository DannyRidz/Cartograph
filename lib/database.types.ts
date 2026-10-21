import type { RepositoryResult } from "./parser/types";

export type PipelineStage = "fetch" | "select" | "parse" | "store";

export type AnalysisState = "queued" | "parsing" | "completed" | "failed";

type OwnedRow = { id: string; organization_id: string };
type AnalysisRow = OwnedRow & { analysis_id: string };
type FileRow = AnalysisRow & { file_id: string };
type Table<Row, Relationships extends { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] }[] = []> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

// Matches the tracked migrations. Relationships used by the dashboard are explicit
// so its joined query has a concrete result type, without a cast.
export type Database = {
  public: {
    Tables: {
      organizations: Table<{ id: string; created_at: string }>;
      projects: Table<OwnedRow & { repository_url: string; created_at: string }>;
      analyses: Table<OwnedRow & {
        project_id: string;
        state: AnalysisState;
        is_seed: boolean;
        stage: PipelineStage | "queued" | "completed" | "failed";
        stage_message: string;
        failed_stage: PipelineStage | null;
        failure_message: string | null;
        updated_at: string;
        commit_sha: string | null;
        adapter: string | null;
        schema_version: number | null;
        coverage: RepositoryResult["coverage"] | null;
        created_at: string;
      }, [{
        foreignKeyName: "analyses_organization_id_project_id_fkey";
        columns: ["organization_id", "project_id"];
        isOneToOne: false;
        referencedRelation: "projects";
        referencedColumns: ["organization_id", "id"];
      }]>;
      files: Table<AnalysisRow & { path: string; folder: string | null; module: string | null;
        kind: "module" | "script" | null; line_count: number | null; hash: string | null;
        fan_in: number | null; fan_out: number | null }>;
      edges: Table<AnalysisRow & { source_file_id: string; target_file_id: string; kind: "import" | "re-export" | "dynamic-import" }>;
      routes: Table<FileRow & { method: string; path: string }>;
      explanations: Table<FileRow & { body: string }>;
      file_roles: Table<FileRow & { role: string }>;
      insights: Table<AnalysisRow & { body: string }>;
      ai_cache: Table<{ organization_id: string; cache_key: string; model: string;
        kind: "file" | "folder" | "role"; body: string; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      heartbeat_analysis: { Args: { p_analysis_id: string }; Returns: undefined };
      begin_analysis: { Args: { p_repository_url: string; p_reanalyse?: boolean }; Returns: { analysis_id: string; created: boolean }[] };
      advance_analysis: { Args: { p_analysis_id: string; p_expected_stage: PipelineStage;
        p_stage: PipelineStage; p_message: string; p_commit_sha?: string }; Returns: undefined };
      fail_analysis: { Args: { p_analysis_id: string; p_stage: PipelineStage; p_message: string }; Returns: undefined };
      store_analysis: { Args: { p_analysis_id: string; p_result: RepositoryResult }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
