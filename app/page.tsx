import Link from "next/link";
import { AnalysisForm } from "@/components/analysis-form";
import { ThemeControl } from "@/components/theme-control";
import { MapIllustration, ParseIllustration } from "@/components/landing-illustrations";

export default function Home() {
  return <div className="landing-page">
    <a className="skip-link" href="#content">Skip to content</a>
    <header className="landing-header">
      <div className="landing-container landing-header-inner">
        <Link href="/" className="brand">Cartograph</Link>
        <nav aria-label="Page controls">
          <ThemeControl />
          <Link className="analysis-link" href="/workspace" prefetch={false}>Open workspace</Link>
        </nav>
      </div>
    </header>
    <main id="content" className="landing-container">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="landing-hero-copy">
          <h1 id="hero-title">See how the<br />code connects.</h1>
          <p>A dependency map for the codebase you need to understand. Folders, files, and the imports between them, drawn from the code.</p>
          <AnalysisForm landing />
        </div>
        <MapIllustration />
      </section>
      <section className="landing-section landing-split" aria-labelledby="explore-title">
        <div>
          <h2 id="explore-title">Start with the shape.<br />Follow a connection.</h2>
          <p>Open a folder to see its files. Select a file to see what it imports, what imports it, and what depends on it two levels out.</p>
          <p>Ask for an explanation, or ask the repository a question. The answers use the source and the connections the parser found.</p>
        </div>
        <MapIllustration detail />
      </section>
      <section className="landing-section" aria-labelledby="process-title">
        <div className="landing-split">
          <div>
            <h2 id="process-title">Code first.<br />Explanation after.</h2>
            <p>The parser resolves imports to real files. Graph calculations trace the connections. AI explains what those steps found.</p>
          </div>
          <ParseIllustration />
        </div>
        <ol className="landing-steps">
          <li><h3>Read the repository</h3><p>Start with a public GitHub URL. Cartograph fetches the code and shows progress as it parses.</p></li>
          <li><h3>Build the map</h3><p>Resolved imports become connections. Skipped files and unresolved imports stay visible in the coverage report.</p></li>
          <li><h3>Explore and ask</h3><p>Follow dependencies on the canvas. Read an explanation of a file, or watch a question get looked up.</p></li>
        </ol>
      </section>
      <section className="landing-section" aria-labelledby="frameworks-title">
        <h2 id="frameworks-title">The language, and<br />the framework around it.</h2>
        <p className="landing-wide-copy">Cartograph parses TypeScript and JavaScript. Framework adapters add file roles and recover routes where the syntax gives a complete answer.</p>
        <dl className="landing-frameworks">
          <div><dt>Next.js</dt><dd>App and Pages Router conventions.</dd></div>
          <div><dt>React</dt><dd>Components, hooks, and file roles.</dd></div>
          <div><dt>Express</dt><dd>Statically recoverable HTTP routes.</dd></div>
          <div><dt>NestJS</dt><dd>Controllers, providers, and routes.</dd></div>
        </dl>
        <p className="landing-wide-copy">Other TypeScript and JavaScript repositories still get an import map. Framework knowledge adds context to it.</p>
      </section>
      <section className="landing-section landing-limits" aria-labelledby="limits-title">
        <h2 id="limits-title">A map you can question.<br />No connections to guess at.</h2>
        <p className="landing-wide-copy">A plausible connection is not enough. Every edge needs a real import resolved to a real file. When something cannot be recovered, you see the limit.</p>
        <dl className="landing-boundaries">
          <div><dt>No invented structure</dt><dd>AI explains the graph. It never decides which files are connected.</dd></div>
          <div><dt>No approximate routes</dt><dd>If the full path and method cannot be recovered, the route is left out.</dd></div>
          <div><dt>No code grades</dt><dd>No scores, ratings, or review badges. This is a way to understand a codebase.</dd></div>
          <div><dt>Public repositories only</dt><dd>TypeScript and JavaScript, without access to your private repositories.</dd></div>
        </dl>
      </section>
    </main>
    <footer className="landing-container landing-footer"><Link href="/" className="brand">Cartograph</Link><p>A dependency map drawn from the code.</p><Link href="/workspace" className="analysis-link" prefetch={false}>Open workspace</Link></footer>
  </div>;
}
