import rawRepository from "./redux-toolkit.json";
import { validateRepositoryResult } from "../parser/data";

// Preserve the parser contract and validate the checked in fixture before rendering.
const repository: unknown = rawRepository;
validateRepositoryResult(repository);
export const previewRepository = repository;
export const previewSource = {
  url: "https://github.com/reduxjs/redux-toolkit",
  commit: "0fd611cc79d44990ac9a040dec4d5cb446233440",
  directory: "packages/toolkit",
};
