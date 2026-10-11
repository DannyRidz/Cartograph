export const PANEL_ROWS = 12;
export const ROW_HEIGHT = 28;

export function panelWindow(fileCount: number, requestedOffset = 0) {
  const height = Math.min(PANEL_ROWS, fileCount) * ROW_HEIGHT;
  const offset = Math.max(0, Math.min(requestedOffset, fileCount * ROW_HEIGHT - height));
  // Partially clipped rows use summary ports until the whole row is visible.
  const start = Math.ceil(offset / ROW_HEIGHT);
  const end = Math.min(fileCount, Math.floor((offset + height) / ROW_HEIGHT));
  return { start, end, offset, height, above: start, below: fileCount - end };
}

export function filePort(index: number, path: string, window: ReturnType<typeof panelWindow>) {
  return index < window.start ? "above" : index >= window.end ? "below" : path;
}

export function panelPorts(paths: string[], opened: boolean, offset: number, height: number) {
  const window = panelWindow(paths.length, offset);
  const listTop = 63 + (paths.length > PANEL_ROWS ? ROW_HEIGHT : 0);
  const above = 63 + ROW_HEIGHT / 2;
  const below = height - 1 - ROW_HEIGHT / 2;
  // Keep IDs registered while React Flow applies controlled nodes and edges.
  // Hidden file ports share their summary's position, but only summary edges render.
  return [
    { id: "folder", y: height / 2 },
    { id: "above", y: opened ? above : height / 2 },
    { id: "below", y: opened ? below : height / 2 },
    ...paths.map((id, index) => ({ id, y: !opened ? height / 2
      : index < window.start ? above : index >= window.end ? below
      : listTop + index * ROW_HEIGHT - window.offset + ROW_HEIGHT / 2 })),
  ];
}
