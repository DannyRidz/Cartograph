import type { SourceFile } from "ts-morph";
import type { RepositoryFile, RepositoryRoute } from "./types.ts";

export interface AdapterFile {
  path: string;
  folder: string;
  isModule: boolean;
}

export interface RepositoryAdapter {
  name: string;
  inspect?(file: AdapterFile, source: SourceFile, sources: SourceFile[]): { role: string; routes: RepositoryRoute[] };
  classify(file: AdapterFile): Pick<RepositoryFile, "module" | "kind">;
}

export const fallbackAdapter: RepositoryAdapter = {
  name: "fallback",
  classify(file) {
    return {
      module: file.folder,
      kind: file.isModule ? "module" : "script",
    };
  },
};
