import assert from 'node:assert/strict';
import { evaluateAgent, parseAgentEvidence, type AgentEvaluationEvidence } from '../evals/agent/evaluate.ts';
const base: AgentEvaluationEvidence = { version: 1, repository: 'https://github.com/example/evaluator-fixture', commit: 'a'.repeat(40), files: ['src/auth.ts'], cases: [
  { id: 'authentication', question: 'where?', answer: 'Recorded: src/auth.ts.', paths: ['src/auth.ts'], tools: [{ name: 'search_files', args: { query: 'auth' }, status: 'complete' }] },
  { id: 'followup', question: 'what breaks?', answer: 'Potential importers; not proof of runtime breakage.', paths: [], tools: [{ name: 'walk_dependencies', args: { path: 'src/auth.ts', direction: 'incoming' }, status: 'complete' }] },
  { id: 'refusal', question: 'good?', answer: 'I cannot assess quality from imports. I can show routes and files.', paths: [], tools: [{ name: 'analysis_summary', args: {}, status: 'complete' }] },
  { id: 'plumbing', question: 'how?', answer: 'Recorded authentication files are in src/auth.ts. The API route is recorded.', paths: ['src/auth.ts'], tools: [{ name: 'search_files', args: { query: 'auth' }, status: 'complete' }] },
] };
assert.ok(evaluateAgent(parseAgentEvidence(base)).every((item) => item.passed));
function broken(change: (value: AgentEvaluationEvidence) => void, check: string) {
  const value = structuredClone(base); change(value);
  assert.ok(evaluateAgent(value).some((item) => item.checks[check] === false));
}
broken((value) => { value.cases[0].tools = []; }, 'looked_up');
broken((value) => { value.cases[0].answer = 'Probably handled in src/auth.ts'; }, 'no_lookup_avoidance');
broken((value) => { value.cases[3].answer = 'I call the search_files tool with a bearer token.'; }, 'no_plumbing');
broken((value) => { value.cases[0].paths = ['invented.ts']; }, 'recorded_file_paths');
broken((value) => { value.cases[0].answer += ' See missing.ts'; }, 'recorded_file_paths');
broken((value) => { value.cases[1].tools[0].args.direction = 'outgoing'; }, 'incoming_walk');
broken((value) => { value.cases[2].answer = 'This code is good.'; }, 'declines_quality');
broken((value) => { value.cases[0].tools[0].status = 'failed'; }, 'no_failed_or_pending_lookup');
assert.throws(() => evaluateAgent({ ...base, cases: [] }));
assert.throws(() => parseAgentEvidence({ ...base, cases: [{ tools: 'corrupt' }] }));
console.log('Agent evaluator accepts supported answers and impact caveats; rejects missing or wrong lookups, lookup avoidance, plumbing, invented paths, quality judgements and corrupt evidence.');
