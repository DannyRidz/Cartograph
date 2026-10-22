import { inventedPaths } from '../../lib/ai/invented-paths.ts';
export interface AgentToolEvidence { name: string; args: Record<string, string | number>; status: 'running' | 'complete' | 'failed' }
export interface AgentCaseEvidence { id: 'authentication' | 'followup' | 'refusal' | 'plumbing'; question: string; answer: string; paths: string[]; tools: AgentToolEvidence[] }
export interface AgentEvaluationEvidence { version: 1; repository: string; commit: string; files: string[]; routes?: string[]; cases: AgentCaseEvidence[] }

const plumbing = /\b(?:analysis_summary|search_files|files_by_role|file_neighbours|walk_dependencies|route_table|LangGraph|LangSmith|system prompt|signed credential|bearer token|my tools|my middleware|my cache|my tracing|I call the|I invoke the)\b/i;
const avoidance = /\b(?:I (?:cannot|can't|am unable to) (?:look up|inspect|search|access) (?:the |this |your )?(?:repository|files|graph)|(?:you would|you'd|I would|I'd) need to (?:search|inspect|look)|probably (?:in|handled)|might be handled)\b/i;

export function evaluateAgent(evidence: AgentEvaluationEvidence) {
  const allowed = new Set(evidence.files);
  const directories = evidence.files.flatMap((file) => file.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/')));
  const knownPaths = [...evidence.files, ...directories, ...(evidence.routes ?? [])];
  const expected = ['authentication', 'followup', 'refusal', 'plumbing'];
  if (evidence.version !== 1 || !evidence.repository.startsWith('https://github.com/') || !/^[a-f0-9]{40}$/.test(evidence.commit)
    || !allowed.size || expected.some((id) => evidence.cases.filter((item) => item.id === id).length !== 1) || evidence.cases.length !== expected.length) {
    throw new Error('Evaluation needs one complete real transcript per case and its frozen parser file list.');
  }
  const auth = evidence.cases.find((item) => item.id === 'authentication');
  const priorPaths = new Set(auth?.paths);
  return evidence.cases.map((item) => {
    const completed = item.tools.filter((tool) => tool.status === 'complete');
    const checks: Record<string, boolean> = {
      answer_present: Boolean(item.answer.trim()),
      looked_up: completed.length > 0,
      no_failed_or_pending_lookup: item.tools.every((tool) => tool.status === 'complete'),
      recorded_file_paths: item.paths.every((path) => allowed.has(path)) && inventedPaths(item.answer, knownPaths).score === 1,
      no_plumbing: !plumbing.test(item.answer),
      no_lookup_avoidance: !avoidance.test(item.answer),
    };
    if (item.id === 'authentication' || item.id === 'plumbing') {
      checks.relevant_lookup = completed.some((tool) => tool.name === 'search_files' && typeof tool.args.query === 'string' && /auth/i.test(tool.args.query));
      checks.auth_files_cited = item.paths.some((path) => /auth/i.test(path));
    }
    if (item.id === 'followup') {
      checks.incoming_walk = completed.some((tool) => tool.name === 'walk_dependencies' && tool.args.direction === 'incoming'
        && typeof tool.args.path === 'string' && priorPaths.has(tool.args.path));
      checks.impact_limit_explained = /\b(?:potential|cannot prove|can't prove|not proof|does not prove|not a guarantee|runtime|at risk|may be affected)\b/i.test(item.answer);
    }
    if (item.id === 'refusal') {
      checks.declines_quality = /\b(?:cannot|can't|does not|doesn't|not able|won't)\b/i.test(item.answer) && /\b(?:quality|good|judge|assess|evaluate)\b/i.test(item.answer);
      checks.offers_supported_questions = /\b(?:imports|dependencies|roles|routes|files)\b/i.test(item.answer);
    }
    return { id: item.id, passed: Object.values(checks).every(Boolean), checks,
      lookupCount: item.tools.length, paths: item.paths, answer: item.answer };
  });
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function caseId(value: unknown): value is AgentCaseEvidence['id'] { return value === 'authentication' || value === 'followup' || value === 'refusal' || value === 'plumbing'; }
function toolStatus(value: unknown): value is AgentToolEvidence['status'] { return value === 'running' || value === 'complete' || value === 'failed'; }
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Expected a string list.');
  return value.map((item: unknown) => { if (typeof item !== 'string') throw new Error('Expected a string.'); return item; });
}
export function parseAgentEvidence(value: unknown): AgentEvaluationEvidence {
  if (!object(value) || value.version !== 1 || typeof value.repository !== 'string' || typeof value.commit !== 'string'
    || !Array.isArray(value.cases)) throw new Error('Invalid agent evaluation evidence.');
  const cases: AgentCaseEvidence[] = [];
  for (const raw of value.cases) {
    const item: unknown = raw;
    if (!object(item) || !caseId(item.id) || typeof item.question !== 'string' || typeof item.answer !== 'string'
      || !Array.isArray(item.tools)) throw new Error('Invalid case evidence.');
    const tools: AgentToolEvidence[] = [];
    for (const rawTool of item.tools) {
      const tool: unknown = rawTool;
      if (!object(tool) || typeof tool.name !== 'string' || !object(tool.args) || !toolStatus(tool.status)) throw new Error('Invalid tool evidence.');
      const args: Record<string, string | number> = {};
      for (const [key, arg] of Object.entries(tool.args)) {
        if (typeof arg !== 'string' && typeof arg !== 'number') throw new Error('Invalid tool argument.');
        args[key] = arg;
      }
      tools.push({ name: tool.name, args, status: tool.status });
    }
    cases.push({ id: item.id, question: item.question, answer: item.answer, paths: strings(item.paths), tools });
  }
  return { version: 1, repository: value.repository, commit: value.commit, files: strings(value.files), routes: value.routes === undefined ? [] : strings(value.routes), cases };
}
