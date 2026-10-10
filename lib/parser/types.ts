export type ImportKind = "import" | "re-export" | "dynamic-import";

export interface RepositoryFile {
  path: string;
  folder: string;
  module: string;
  kind: "module" | "script";
  lineCount: number;
  hash: string;
  fanIn: number;
  fanOut: number;
}

export interface RepositoryEdge {
  from: string;
  to: string;
  kind: ImportKind;
}

export interface ImportOutcome {
  file: string;
  line: number;
  kind: ImportKind;
  specifier: string | null;
  status: "resolved" | "external" | "excluded" | "unresolved";
  target: string | null;
  reason: string | null;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface RepositoryResult {
  schemaVersion: 1;
  adapter: string;
  files: RepositoryFile[];
  edges: RepositoryEdge[];
  coverage: {
    filesFound: number;
    filesParsed: number;
    filesSkipped: number;
    folders: number;
    skipped: SkippedFile[];
    excludedDirectories: SkippedFile[];
    imports: ImportOutcome[];
    totals: Record<ImportOutcome["status"], number>;
  };
}
