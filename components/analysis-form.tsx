"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AnalysisForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const repositoryUrl = new FormData(event.currentTarget).get("repositoryUrl");
    setPending(true);
    setError("");
    try {
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
      setPending(false);
    }
  }

  return <form className="analysis-form" onSubmit={submit} aria-busy={pending}>
    <label htmlFor="repository-url">Public GitHub repository</label>
    <div className="analysis-form-fields">
      <input id="repository-url" name="repositoryUrl" type="url" placeholder="https://github.com/owner/repository"
        required maxLength={512} autoComplete="off" aria-describedby={error ? "analysis-form-error" : undefined} disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? "Starting…" : "Analyse repository"}</button>
    </div>
    {error && <p id="analysis-form-error" role="alert">{error}</p>}
  </form>;
}
