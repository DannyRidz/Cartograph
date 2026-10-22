"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { publicRepository } from "@/lib/pipeline/repository";

const pendingRepositoryKey = "cartograph:pending-repository";

export function AnalysisForm({ landing = false }: { landing?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const starting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const start = useCallback(async (value: string) => {
    if (starting.current) return;
    starting.current = true;
    setPending(true);
    setError("");
    try {
      const repositoryUrl = publicRepository(value).url;
      if (landing) {
        // Clerk returns to the workspace after both sign in and team selection.
        // Keep this intent in the same tab until that workspace can mount.
        try { sessionStorage.setItem(pendingRepositoryKey, repositoryUrl); }
        catch { throw new Error("Your browser could not carry the repository through sign in. Allow session storage and try again."); }
        router.push("/workspace");
        return;
      }
      const response = await fetch("/api/analyses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        throw new Error(result && typeof result === "object" && "message" in result && typeof result.message === "string"
          ? result.message : "The analysis could not be started.");
      }
      if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string"
        || !/^[a-f0-9-]{36}$/i.test(result.id)) throw new Error("The server did not return an analysis ID.");
      router.push(`/workspace/analyses/${result.id}`);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "The request failed. Try again.");
    } finally {
      // Client navigation can preserve this form when returning to the dashboard.
      starting.current = false;
      setPending(false);
    }
  }, [landing, router]);

  useEffect(() => {
    if (landing) return;
    async function resume() {
      let repository: string | null;
      try {
        repository = sessionStorage.getItem(pendingRepositoryKey);
        // Consume before posting, including when React replays this effect.
        sessionStorage.removeItem(pendingRepositoryKey);
      } catch {
        setError("Your browser could not restore the repository. Paste its URL to continue.");
        return;
      }
      if (!repository) return;
      if (input.current) input.current.value = repository;
      await start(repository);
    }
    void resume();
  }, [landing, start]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void start(input.current?.value ?? "");
  }

  return <form className={`analysis-form${landing ? " landing-form" : ""}`} onSubmit={submit} aria-busy={pending}>
    <label htmlFor="repository-url">Public GitHub repository</label>
    <div className="analysis-form-fields">
      <input ref={input} id="repository-url" name="repositoryUrl" type="url" placeholder="https://github.com/owner/repository"
        required maxLength={512} autoComplete="off" spellCheck={false} aria-invalid={error ? true : undefined}
        aria-describedby={error ? "analysis-form-error" : landing ? "landing-form-note" : undefined} disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? "Starting…" : "Analyse repository"}</button>
    </div>
    {error && <p id="analysis-form-error" role="alert">{error}</p>}
    {landing && <p id="landing-form-note">Public TypeScript and JavaScript repositories. Sign in to start the analysis.</p>}
  </form>;
}
