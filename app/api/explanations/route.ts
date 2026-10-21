import { explain } from "@/lib/ai/explain";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ message: "A matching request origin is required." }, { status: 403 });
  let input: { analysisId: string; target: string; kind: "file" | "folder" };
  try {
    const text = await request.text();
    if (text.length > 4096) throw new Error("The request is too large.");
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || !("analysisId" in value) || typeof value.analysisId !== "string"
      || !("target" in value) || typeof value.target !== "string" || !value.target
      || !("kind" in value) || (value.kind !== "file" && value.kind !== "folder")) throw new Error("Supply an analysis, target and selection kind.");
    input = { analysisId: value.analysisId, target: value.target, kind: value.kind };
  } catch (error: unknown) {
    return Response.json({ message: error instanceof Error ? error.message : "Invalid request." }, { status: 400 });
  }
  try { return Response.json(await explain(input.analysisId, input.target, input.kind)); }
  catch (error: unknown) {
    console.error("Explanation failed", error);
    return Response.json({ message: error instanceof Error ? error.message : "The explanation failed." }, { status: 500 });
  }
}
