"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controls, Handle, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import type { RepositoryResult } from "@/lib/parser/types";
import { foldRepository, uniqueLabels, type FoldedModule } from "@/lib/canvas/folding";
import { layoutModules } from "@/lib/canvas/layout";
import { PANEL_ROWS, ROW_HEIGHT, panelPorts, panelWindow } from "@/lib/canvas/window";
import { canvasConnections } from "@/lib/canvas/connections";
import { repositoryDetails } from "@/lib/canvas/details";
import { RepositoryDetails } from "@/components/repository-details";
import { CanvasShell } from "@/components/canvas-shell";

interface ModuleData extends Record<string, unknown> {
  module: FoldedModule;
  opened: boolean;
  labels: Map<string, string>;
  activeFiles: Set<string> | null;
  selected: string | null;
  highlighted: Set<string>;
  hover: (path: string | null) => void;
  toggle: (id: string) => void;
  select: (path: string) => void;
  offset: number;
  scroll: (id: string, offset: number) => void;
}
type ModuleNode = Node<ModuleData, "module">;

function Ports({ id }: { id: string }) {
  return <><Handle id={`${id}:in`} type="target" position={Position.Left} isConnectable={false} /><Handle id={`${id}:out`} type="source" position={Position.Right} isConnectable={false} /></>;
}

function ModulePanel({ data }: NodeProps<ModuleNode>) {
  const { module, opened, labels } = data;
  const window = panelWindow(module.files.length, data.offset);
  const overflow = module.files.length > PANEL_ROWS;
  const scrollElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollElement.current && scrollElement.current.scrollTop !== window.offset) {
      scrollElement.current.scrollTop = window.offset;
    }
  }, [window.offset]);
  const summary = (side: "above" | "below") => {
    const files = side === "above" ? module.files.slice(0, window.start) : module.files.slice(window.end);
    const active = !data.activeFiles || files.some((file) => data.activeFiles?.has(file.path));
    return <div className={`module-summary${active || files.some((file) => data.highlighted.has(file.path)) ? "" : " is-dimmed"}${files.some((file) => data.highlighted.has(file.path)) ? " is-highlighted" : ""}`}>
      {files.length > 0 && <Ports id={side} />}{files.length} files {side}
    </div>;
  };
  return (
    <div className={`module-panel${opened ? " is-open" : ""}${data.selected === module.id ? " is-selected" : ""}${module.files.some((file) => data.highlighted.has(file.path)) ? " is-highlighted" : ""}`}>
      <button className="module-header nodrag nopan" onClick={() => data.toggle(module.id)} onMouseEnter={() => data.hover(module.id)} onMouseLeave={() => data.hover(null)} onFocus={() => data.hover(module.id)} onBlur={() => data.hover(null)} aria-expanded={opened} title={module.id}>
        <code>{labels.get(module.id) ?? module.label}</code>
        <span>{module.files.length} files</span>
        <span className="module-fans"><span className="fan-in">{module.fanIn} in</span><span className="fan-out">{module.fanOut} out</span></span>
      </button>
      {!opened && <Ports id="folder" />}
      {opened && <>
        {overflow && summary("above")}
        <div className="module-list-region" style={{ height: window.height }}>
          <div ref={scrollElement} className="module-scroll nowheel nodrag nopan" onScroll={(event) => data.scroll(module.id, event.currentTarget.scrollTop)}>
            {module.files.map((file) => (
              <div className={`module-row${data.activeFiles && !data.activeFiles.has(file.path) && !data.highlighted.has(file.path) ? " is-dimmed" : ""}${data.highlighted.has(file.path) ? " is-highlighted" : ""}`} key={file.path}>
                <button className="nodrag nopan" onClick={() => data.select(file.path)} onMouseEnter={() => data.hover(file.path)} onMouseLeave={() => data.hover(null)} onFocus={() => data.hover(file.path)} onBlur={() => data.hover(null)} aria-pressed={data.selected === file.path} title={`${file.path}, ${file.fanIn} incoming, ${file.fanOut} outgoing`}>
                  <span className={`file-swatch ${file.kind}`} aria-hidden="true" />
                  <code>{labels.get(file.path) ?? file.path.split("/").pop()}</code>
                  <span className="row-fan-in">{file.fanIn}</span>
                </button>
              </div>
            ))}
          </div>
          {module.files.slice(window.start, window.end).map((file, index) => (
            <div className={`module-row-port${data.activeFiles && !data.activeFiles.has(file.path) && !data.highlighted.has(file.path) ? " is-dimmed" : ""}${data.highlighted.has(file.path) ? " is-highlighted" : ""}`} key={file.path} style={{ top: (window.start + index) * ROW_HEIGHT - window.offset + ROW_HEIGHT / 2 }}><Ports id={file.path} /></div>
          ))}
        </div>
        {overflow && summary("below")}
      </>}

    </div>
  );
}
const nodeTypes = { module: ModulePanel };

function Refit({ revision }: { revision: string }) {
  const initialized = useNodesInitialized();
  const { fitView, getZoom, viewportInitialized } = useReactFlow();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || !viewportInitialized || fitted.current === revision) return;
    // Wait for the expanded nodes and their row handles to reach the store.
    const frame = requestAnimationFrame(() => {
      fitted.current = revision;
      void fitView({ padding: 0.04, minZoom: 0.05, maxZoom: Math.min(1, getZoom()), duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, viewportInitialized, revision, fitView, getZoom]);
  return null;
}

function Canvas({ repository, name }: { repository: RepositoryResult; name: string }) {
  const folded = useMemo(() => foldRepository(repository.files, repository.edges), [repository]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [offsets, setOffsets] = useState<Map<string, number>>(new Map());
  const scroll = (id: string, offset: number) => setOffsets((current) => current.get(id) === offset ? current : new Map(current).set(id, offset));
  const details = useMemo(() => repositoryDetails(repository.files, repository.edges), [repository]);
  const [hovered, setHovered] = useState<string | null>(null);
  const highlighted = new Set(hovered === null ? [] : folded.modules.find((module) => module.id === hovered)?.files.map((file) => file.path) ?? [hovered]);
  const [selected, setSelected] = useState<string | null>(null);
  const toggle = (id: string) => {
    setSelected(id);
    setOffsets((current) => new Map(current).set(id, 0));
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const select = (path: string) => setSelected((current) => current === path ? null : path);
  const selectFromDetails = (path: string) => {
    const owner = folded.owner.get(path);
    if (owner === undefined) throw new Error(`Missing canvas owner: ${path}`);
    const folder = folded.modules.find((item) => item.id === owner);
    const index = folder?.files.findIndex((file) => file.path === path) ?? -1;
    if (index < 0) throw new Error(`Missing canvas file: ${path}`);
    setSelected(path);
    setHovered(null);
    setOpened((current) => current.has(owner) ? current : new Set(current).add(owner));
    setOffsets((current) => new Map(current).set(owner, index * ROW_HEIGHT));
  };
  const connections = canvasConnections(folded.modules, repository.edges, opened, selected, offsets);
  const { activeFiles } = connections;
  const labels = uniqueLabels([...folded.modules.map((module) => module.id), ...folded.modules.filter((module) => opened.has(module.id)).flatMap((module) => {
    const window = panelWindow(module.files.length, offsets.get(module.id));
    return module.files.slice(window.start, window.end).map((file) => file.path);
  })]);
  // Size using every possible row label so scrolling never changes the layout.
  const positions = useMemo(() => {
    const sizingLabels = uniqueLabels([...folded.modules.map((module) => module.id), ...folded.modules.filter((module) => opened.has(module.id)).flatMap((module) => module.files.map((file) => file.path))]);
    return layoutModules(folded.modules, repository.edges, folded.owner, opened, sizingLabels);
  }, [folded, repository.edges, opened]);
  const nodes: ModuleNode[] = folded.modules.map((module, index) => {
    const placement = positions[index];
    return {
      id: module.id, type: "module", position: placement.position,
      width: placement.width, height: placement.height,
      // These fixed dimensions must survive controlled node updates for fitting.
      measured: { width: placement.width, height: placement.height },
      // Publish new ports with their edges, before DOM measurement runs.
      handles: panelPorts(module.files.map((file) => file.path), opened.has(module.id), offsets.get(module.id) ?? 0, placement.height).flatMap((port) => [
        { id: `${port.id}:in`, type: "target", position: Position.Left, x: -1, y: port.y - 2, width: 4, height: 4 },
        { id: `${port.id}:out`, type: "source", position: Position.Right, x: placement.width - 3, y: port.y - 2, width: 4, height: 4 },
      ]),
      style: { width: placement.width, height: placement.height, pointerEvents: "all", opacity: activeFiles && !module.files.some((file) => activeFiles.has(file.path) || highlighted.has(file.path)) ? 0.18 : 1 },
      data: { module, opened: opened.has(module.id), labels, activeFiles, selected, highlighted, hover: setHovered, toggle, select, offset: offsets.get(module.id) ?? 0, scroll },
    };
  });
  const edges: Edge[] = connections.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle, type: "default",
    style: { stroke: edge.direction === "incoming" ? "var(--incoming)" : edge.direction === "outgoing" ? "var(--outgoing)" : "var(--muted)", opacity: edge.active ? 0.8 : 0.08 },
  }));
  const categories = (["module", "script"] as const).map((kind) => ({ kind, count: repository.files.filter((file) => file.kind === kind).length })).filter((category) => category.count > 0);
  return <CanvasShell details={<RepositoryDetails name={name} repository={repository} details={details} folder={folded.modules.find((module) => module.id === selected)} selected={selected} highlighted={highlighted} select={selectFromDetails} hover={setHovered} />} rail={<><h2 id="categories-heading" className="panel-heading">File categories</h2><ul className="file-categories">{categories.map(({ kind, count }) => <li key={kind}><span className={`file-swatch ${kind}`} aria-hidden="true" /><span>{kind === "module" ? "Modules" : "Scripts"}</span><span>{count}</span></li>)}</ul><p className="canvas-coverage">{repository.coverage.filesParsed} parsed<br />{repository.coverage.filesSkipped} skipped<br />{repository.coverage.totals.unresolved} unresolved imports</p></>}>
    <div className="canvas-toolbar"><span>{folded.modules.length} folders</span><span>Height = incoming dependencies</span><button onClick={() => setSelected(null)} disabled={selected === null}>Clear selection</button></div>
    <div className="canvas-flow"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.04, maxZoom: 1 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.05} maxZoom={2} onPaneClick={() => setSelected(null)}><Refit revision={[...opened].sort().join("|")} /><Controls showInteractive={false} /></ReactFlow></div>
  </CanvasShell>;
}

export function DependencyCanvas({ repository, name }: { repository: RepositoryResult; name: string }) {
  return <ReactFlowProvider><Canvas repository={repository} name={name} /></ReactFlowProvider>;
}
