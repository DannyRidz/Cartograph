import type { RepositoryRoute } from "@/lib/parser/types";

interface RoutesProps {
  routes: RepositoryRoute[];
  selected: string | null;
  select: (path: string) => void;
  hover: (path: string | null) => void;
}

export function RepositoryRoutes({ routes, selected, select, hover }: RoutesProps) {
  return <section className="route-section" aria-labelledby="routes-heading">
    <h2 id="routes-heading">Routes <span>{routes.length}</span></h2>
    {routes.length ? <div className="route-scroll" role="region" aria-label="Route table" tabIndex={0}>
      <table className="route-table">
        <thead><tr><th scope="col">Method</th><th scope="col">Pattern</th><th scope="col">File</th></tr></thead>
        <tbody>{routes.map((route) => <tr key={JSON.stringify(route)}>
          <td><code>{route.method}</code></td>
          <td><code>{route.path}</code></td>
          <td><button className="detail-path" aria-pressed={selected === route.file}
            onClick={() => select(route.file)} onMouseEnter={() => hover(route.file)} onMouseLeave={() => hover(null)}
            onFocus={() => hover(route.file)} onBlur={() => hover(null)}><code>{route.file}</code></button></td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="detail-note">No exact routes recovered.</p>}
  </section>;
}
