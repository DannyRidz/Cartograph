/** Abstract diagrams, never a projection of a repository or an analysis result. */
export function MapIllustration({ detail = false }: { detail?: boolean }) {
  const panels = detail
    ? [{ x: 20, y: 110, width: 112, rows: 3 }, { x: 192, y: 70, width: 112, rows: 5 }, { x: 364, y: 130, width: 112, rows: 3 }]
    : [{ x: 20, y: 40, width: 122, rows: 3 }, { x: 20, y: 238, width: 122, rows: 2 }, { x: 200, y: 118, width: 122, rows: 4 }, { x: 378, y: 28, width: 110, rows: 2 }, { x: 378, y: 248, width: 110, rows: 2 }];
  return <svg className="landing-diagram" viewBox="0 0 508 380" fill="none" aria-hidden="true" focusable="false">
    <g stroke={detail ? "var(--incoming)" : "var(--muted)"} strokeWidth="1">
      {detail ? <>
        <path d="M132 174H158V174H192" />
        <path d="M304 174H334V194H364" stroke="var(--outgoing)" />
        <path d="m186 170 6 4-6 4M358 190l6 4-6 4" />
      </> : <>
        <path d="M142 80H170V158H200M142 278H170V214H200M322 158H350V68H378M322 242H350V288H378" />
        <path d="m194 154 6 4-6 4m-6 48 6 4-6 4M372 64l6 4-6 4m-6 212 6 4-6 4" />
      </>}
    </g>
    {panels.map((panel, index) => <g key={index}>
      <rect x={panel.x} y={panel.y} width={panel.width} height={44 + panel.rows * 28}
        fill="var(--surface)" stroke={index === (detail ? 1 : 2) ? "var(--accent)" : "var(--border)"} />
      <rect x={panel.x + 12} y={panel.y + 15} width="6" height="6" fill={index === (detail ? 1 : 2) ? "var(--accent)" : "var(--muted)"} />
      <path d={`M${panel.x + 26} ${panel.y + 18}h${panel.width - 42}`} stroke="var(--muted)" />
      <path d={`M${panel.x} ${panel.y + 38}h${panel.width}`} stroke="var(--border)" />
      {Array.from({ length: panel.rows }, (_, row) => <g key={row}>
        {detail && index === 1 && row === 2 && <rect x={panel.x + 1} y={panel.y + 40 + row * 28} width={panel.width - 2} height="28" fill="var(--hover)" />}
        <path d={`M${panel.x + 12} ${panel.y + 54 + row * 28}h${panel.width - 32 - (row % 2) * 18}`} stroke={detail && index === 1 && row === 2 ? "var(--accent)" : "var(--border)"} />
      </g>)}
    </g>)}
  </svg>;
}

export function ParseIllustration() {
  return <svg className="landing-diagram landing-parse" viewBox="0 0 508 240" fill="none" aria-hidden="true" focusable="false">
    <g stroke="var(--border)" fill="var(--surface)">
      <path d="M32 32h100l24 24v152H32Z" />
      <path d="M132 32v24h24" />
      <rect x="220" y="68" width="72" height="104" />
      <rect x="364" y="32" width="112" height="64" />
      <rect x="364" y="144" width="112" height="64" />
    </g>
    <g stroke="var(--muted)">
      <path d="M52 84h80M52 104h56M52 124h72M52 144h48M52 164h64" />
      <path d="M156 120h64m-6-4 6 4-6 4M292 120h36V64h36m-6-4 6 4-6 4M328 120v56h36m-6-4 6 4-6 4" />
    </g>
    <g stroke="var(--accent)">
      <path d="m248 104-12 16 12 16m16-32 12 16-12 16" />
      <path d="M380 52h56M380 72h80M380 164h80M380 184h48" />
    </g>
  </svg>;
}
