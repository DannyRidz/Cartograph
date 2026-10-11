import type { Metadata } from "next";
import { DependencyCanvas } from "@/components/dependency-canvas";
import { previewRepository, previewSource } from "@/lib/fixtures/redux-toolkit";

export const metadata: Metadata = {
  title: "Canvas preview | Cartograph",
};

export default function PreviewPage() {
  return (
    <div className="canvas-preview">
      <a className="skip-link" href="#canvas">Skip to map</a>
      <header className="app-header">
        <h1 className="brand canvas-title">Cartograph</h1>
        <span className="muted">Canvas preview</span>
        <a className="preview-source" href={`${previewSource.url}/tree/${previewSource.commit}/${previewSource.directory}`}><code>reduxjs/redux-toolkit · {previewSource.directory}</code></a>
      </header>
      <DependencyCanvas repository={previewRepository} name="reduxjs/redux-toolkit" />
    </div>
  );
}
