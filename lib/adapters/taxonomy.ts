// Browser safe: reading order and labels never import parser or filesystem code.
export const taxonomies: Record<string, { name: string; genericRoles: string[]; categories: { role: string; label: string }[] }> = {
  nextjs: { name: "Next.js", genericRoles: ["module", "script"], categories: [
    { role: "page", label: "Page routes" }, { role: "api", label: "API endpoints" },
    { role: "action", label: "Server actions" }, { role: "layout", label: "Layouts" },
    { role: "component", label: "Components" }, { role: "hook", label: "Hooks" }, { role: "module", label: "Modules" }, { role: "script", label: "Scripts" },
  ] },
  nestjs: { name: "NestJS", genericRoles: ["other", "script"], categories: [
    { role: "controller", label: "Controllers" }, { role: "service", label: "Services" },
    { role: "module", label: "Modules" }, { role: "entity", label: "Entities" },
    { role: "guard", label: "Guards" }, { role: "interceptor", label: "Interceptors" },
    { role: "pipe", label: "Pipes" }, { role: "filter", label: "Filters" },
    { role: "other", label: "Other modules" }, { role: "script", label: "Scripts" },
  ] },
  react: { name: "React", genericRoles: ["module", "script"], categories: [
    { role: "component", label: "Components" }, { role: "hook", label: "Hooks" },
    { role: "module", label: "Modules" }, { role: "script", label: "Scripts" },
  ] },
  fallback: { name: "Not detected", genericRoles: ["module", "script"], categories: [{ role: "module", label: "Modules" }, { role: "script", label: "Scripts" }] },
  express: { name: "Express", genericRoles: ["module", "script"], categories: [
    { role: "router", label: "Routers" }, { role: "controller", label: "Controllers" },
    { role: "middleware", label: "Middleware" }, { role: "service", label: "Services" },
    { role: "model", label: "Models" }, { role: "module", label: "Modules" }, { role: "script", label: "Scripts" },
  ] },
};
export function taxonomy(adapter: string) { return taxonomies[adapter] ?? taxonomies.fallback; }
