export default function WorkspacePage() {
  return (
    <>
      <h1 className="panel-heading">Dependency map</h1>
      <div className="map-empty">
        <p>No map yet.</p>
        <p className="muted">No repository has been loaded in this workspace.</p>
      </div>
    </>
  );
}
