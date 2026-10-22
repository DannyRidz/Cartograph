'use client';

import { useEffect, useRef, useState } from 'react';
import { ExplanationProse } from './explanation-prose';
import { readSse } from '@/lib/agent/sse';
import { parseAskEvent, type AskEvent } from '@/lib/agent/stream';

type ToolEvent = Extract<AskEvent, { type: 'tool' }>;
interface Turn { id: number; question: string; selection: string | null; tools: ToolEvent[]; answer: string; status: 'running' | 'done' | 'failed'; error?: string }
const labels: Record<string, string> = { analysis_summary: 'Repository summary', search_files: 'Search file paths', files_by_role: 'Files by role', file_neighbours: 'Direct imports', walk_dependencies: 'Dependency walk', route_table: 'Route table' };

export function AskPane({ analysisId, selected, paths, select }: {
  analysisId?: string; selected: string | null; paths: Set<string>; select: (path: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const thread = useRef<string | undefined>(undefined);
  const active = useRef<AbortController | null>(null);
  const serial = useRef(0);
  useEffect(() => () => active.current?.abort(), []);
  function update(id: number, change: (turn: Turn) => Turn) { setTurns((current) => current.map((turn) => turn.id === id ? change(turn) : turn)); }
  async function ask() {
    if (!analysisId || !question.trim() || active.current) return;
    const id = ++serial.current;
    const controller = new AbortController();
    active.current = controller;
    const text = question.trim();
    setQuestion(''); setBusy(true);
    setTurns((current) => [...current, { id, question: text, selection: selected, tools: [], answer: '', status: 'running' }]);
    let completed = false;
    try {
      const response = await fetch(`/api/analyses/${analysisId}/ask`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, selected, threadId: thread.current }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const body: unknown = await response.json();
        throw new Error(body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'Ask is unavailable. Try again.');
      }
      for await (const chunk of readSse(response.body)) {
        if (chunk.event !== 'ask') continue;
        const event = parseAskEvent(JSON.parse(chunk.data));
        if (event.type === 'thread') thread.current = event.threadId;
        else if (event.type === 'tool') update(id, (turn) => ({ ...turn, tools: turn.tools.some((tool) => tool.id === event.id)
          ? turn.tools.map((tool) => tool.id === event.id ? event : tool) : [...turn.tools, event] }));
        else if (event.type === 'text') update(id, (turn) => ({ ...turn, answer: turn.answer + event.text }));
        else if (event.type === 'error') throw new Error(event.message);
        else if (event.type === 'done') { completed = true; update(id, (turn) => ({ ...turn, status: 'done' })); }
      }
      if (!completed) throw new Error('The answer stream ended early. Try again.');
    } catch (error: unknown) {
      update(id, (turn) => ({ ...turn, status: 'failed', tools: turn.tools.map((tool) => tool.status === 'running' ? { ...tool, status: 'failed' } : tool),
        error: controller.signal.aborted ? 'Stopped. You can ask again or start a new conversation.' : error instanceof Error ? error.message : 'Ask is unavailable. Try again.' }));
    } finally { active.current = null; setBusy(false); }
  }
  return <section className="ask-pane" aria-label="Repository questions">
    <div className="ask-toolbar"><span>{selected ? <>Selected <code>{selected}</code></> : 'Whole repository'}</span>
      <button type="button" disabled={busy || !turns.length} onClick={() => { thread.current = undefined; setTurns([]); }}>New conversation</button></div>
    <div className="ask-history" role="log" aria-label="Questions, lookups and answers" aria-live="off">
      {!analysisId ? <p className="detail-note">Ask is available for a completed analysis in your workspace.</p> : !turns.length && <p className="detail-note">Ask about files, roles, imports or recovered routes. Each lookup appears as it runs.</p>}
      {turns.map((turn) => <article className="ask-turn" key={turn.id}>
        <h3>You</h3><p className="ask-question">{turn.question}</p>
        {turn.selection && <p className="detail-note">Selection: <code>{turn.selection}</code></p>}
        {turn.tools.length > 0 && <ol className="ask-lookups" aria-label="Repository lookups">{turn.tools.map((tool) => <li key={tool.id}>
          <details><summary><span>{labels[tool.name] ?? tool.name}</span><span className="ask-tool-status">{tool.status === 'running' ? 'Looking up…' : tool.status === 'complete' ? 'Complete' : 'Failed'}</span></summary>
            <pre>{JSON.stringify(tool.args, null, 2)}</pre></details>
        </li>)}</ol>}
        {turn.answer && <><h3>Answer{turn.status === 'failed' ? ' (incomplete)' : ''}</h3><ExplanationProse body={turn.answer}
          paths={[...new Set([...turn.answer.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]).filter((path) => paths.has(path)))]} select={select} /></>}
        {turn.error && <p className="form-error" role="alert">{turn.error}</p>}
        {turn.status === 'running' && <p className="detail-note" role="status">{turn.tools.some((tool) => tool.status === 'running') ? 'Looking up repository facts…' : turn.answer ? 'Writing answer…' : 'Waiting for the agent…'}</p>}
      </article>)}
    </div>
    <form className="ask-composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
      <label htmlFor="repository-question">Ask this repository</label>
      <textarea id="repository-question" value={question} maxLength={4000} rows={3} disabled={!analysisId} onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void ask(); } }} />
      <div>{busy ? <button type="button" onClick={() => active.current?.abort()}>Stop</button> : <button type="submit" disabled={!analysisId || !question.trim()}>Ask</button>}
        <span className="detail-note">{question.length}/4,000</span></div>
    </form>
  </section>;
}
