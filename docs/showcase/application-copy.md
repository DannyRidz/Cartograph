# Application copy

Use the version that matches the role. Keep claims tied to the implementation and evidence; there are no measured user growth, latency improvement, or production scale claims here.

## Project summary

Cartograph is a full-stack application that turns public TypeScript and JavaScript repositories into interactive dependency maps. A standalone parser resolves real imports, while pure graph functions calculate dependencies and potential change impact. AI explains the recorded structure, and a repository agent answers questions through visible, scoped lookup tools. The project includes organization workspaces, database row-level security, realtime analysis progress, cached explanations, and recorded behaviour evaluations.

## Software engineering resume entry

**Cartograph | Next.js, React, TypeScript, Supabase, Clerk**

- Built a repository explorer with ts-morph parsing, React Flow visualization, folder expansion, file inspection, and graph-based dependency traversal.
- Implemented organization workspaces with Clerk authentication, Supabase row-level security, realtime progress, and stored repository analyses.
- Kept parsing independent of the application framework and reused pure graph functions across the canvas and repository lookup tools.

## AI engineering resume entry

**Cartograph | OpenAI, Managed Deep Agents, LangSmith, TypeScript**

- Integrated an agent with six read-only repository lookup tools, streamed answers, visible tool activity, and short-lived credentials scoped to one analysis.
- Grounded explanations in source and resolved import context, with cached responses and LangSmith tracing that includes cache hits.
- Implemented offline evaluation of four recorded conversation cases against independent parser truth, checking file references, lookup evidence, contextual traversal, and refusal behaviour.

## Short portfolio card

**Cartograph**

An interactive map of a codebase, grounded in real imports. Explore file dependencies and potential change impact, then inspect recorded AI answers with visible repository lookups. Built with Next.js, TypeScript, ts-morph, React Flow, Supabase, Clerk, and Managed Deep Agents.

Links: [Source code](https://github.com/DannyRidz/Cartograph) · [Screenshot walkthrough](README.md) · [Evaluation evidence](../../evals/agent/README.md).

The full app runs locally. The public repository provides screenshots and recorded examples; no hosted interactive demo is claimed.

## Interview talking points

**Why parse before using AI?** A plausible dependency is not reliable enough to draw as an edge. The parser resolves imports; the model receives recorded facts to explain. Unresolved imports remain explicit gaps.

**How do the map and agent stay consistent?** They share graph calculations. The model chooses lookup arguments, while code performs the traversal.

**How is agent access limited?** The app verifies the user's organization access, registers a short-lived credential for one completed analysis, and supplies it outside model messages. Database policies enforce the grant's scope.

**How do you evaluate the AI?** Recorded answers are compared with an independently frozen file and route snapshot. The current four-case conversation checks concrete behaviour, not broad model reliability. The evaluation can be replayed without a provider call.

**What would change before a public launch?** Add enforceable usage budgets, verify host time and memory limits against representative analyses, and configure production identity and agent hosting. The current showcase deliberately uses captured evidence to avoid exposing paid inference.

**What are the limits?** Public TypeScript and JavaScript repositories only. Import reachability does not prove runtime breakage. The pipeline runs in the app process, route recovery requires exact syntax evidence, and the recorded evaluation corpus is small.
