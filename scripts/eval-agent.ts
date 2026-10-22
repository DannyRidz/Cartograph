import { readFile, writeFile } from 'node:fs/promises';
import { evaluateAgent, parseAgentEvidence } from '../evals/agent/evaluate.ts';

const filename = process.argv[2] ?? 'evals/agent/browser-evidence.json';
const evidence = parseAgentEvidence(JSON.parse(await readFile(filename, 'utf8')));
const cases = evaluateAgent(evidence);
for (const item of cases) console.log(`${item.id}: ${item.passed ? 'PASS' : 'FAIL'} (${item.lookupCount} lookups)${item.passed ? '' : `: ${Object.entries(item.checks).filter(([, passed]) => !passed).map(([name]) => name).join(', ')}`}`);
const report = { repository: evidence.repository, commit: evidence.commit, model: 'gpt-5.5', judge: 'deterministic checks plus transcript inspection',
  checkedAt: new Date().toISOString(), passed: cases.every((item) => item.passed), cases };
await writeFile('evals/agent/latest-results.json', JSON.stringify(report, null, 2) + '\n');
if (!report.passed) process.exitCode = 1;
