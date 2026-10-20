import { after } from "next/server";
import { createDatabaseClient } from "@/lib/supabase";
import { beginAnalysis, runAnalysis } from "@/lib/pipeline/run";
import { publicRepository } from "@/lib/pipeline/repository";

export async function POST(request: Request) {
  // Cookie authentication needs an origin check on mutations outside Server Actions.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ message: "A matching request origin is required." }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 2048) {
    return Response.json({ message: "The request is too large." }, { status: 413 });
  }
  let repositoryUrl: string;
  let reanalyse = false;
  try {
    const text = await request.text();
    if (text.length > 2048) return Response.json({ message: "The request is too large." }, { status: 413 });
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || !("repositoryUrl" in body) || typeof body.repositoryUrl !== "string") {
      throw new Error("Supply a repositoryUrl string.");
    }
    repositoryUrl = publicRepository(body.repositoryUrl).url;
    if ("reanalyse" in body) {
      if (typeof body.reanalyse !== "boolean") throw new Error("reanalyse must be a boolean.");
      reanalyse = body.reanalyse;
    }
  } catch (error: unknown) {
    return Response.json({ message: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }
  const database = await createDatabaseClient();
  try {
    const analysis = await beginAnalysis(database, repositoryUrl, reanalyse);
    if (!analysis.created) return Response.json({ id: analysis.id, existing: true });
    // Capture the authenticated client before the response. Next keeps this work
    // alive for the request lifecycle, without introducing a worker or queue.
    after(async () => {
      try { await runAnalysis(database, analysis.id, analysis.repository); }
      catch (error: unknown) { console.error("Analysis failed and its failed state could not be persisted", error); }
    });
    return Response.json({ id: analysis.id, existing: false }, { status: 202 });
  } catch (error: unknown) {
    console.error("Analysis pipeline failed", error);
    return Response.json({ message: "The analysis could not be started or its state could not be saved. Check the server log." }, { status: 500 });
  }
}
