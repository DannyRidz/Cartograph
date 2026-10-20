export interface Explanation {
  body: string;
  cached: boolean;
  stale: string | null;
  checkedAt: string;
  paths: string[];
  tracing: boolean;
  model: string;
}
