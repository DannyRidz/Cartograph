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

// Matches the first migration. Relationships used by the dashboard are explicit
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
        created_at: string;
      }, [{
        foreignKeyName: "analyses_organization_id_project_id_fkey";
        columns: ["organization_id", "project_id"];
        isOneToOne: false;
        referencedRelation: "projects";
        referencedColumns: ["organization_id", "id"];
      }]>;
      files: Table<AnalysisRow & { path: string }>;
      edges: Table<AnalysisRow & { source_file_id: string; target_file_id: string }>;
      routes: Table<FileRow & { method: string; path: string }>;
      explanations: Table<FileRow & { body: string }>;
      file_roles: Table<FileRow & { role: string }>;
      insights: Table<AnalysisRow & { body: string }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
