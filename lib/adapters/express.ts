import { fallbackAdapter, type RepositoryAdapter } from "../parser/adapter.ts";

const roles: Record<string, string> = {
  route: "router", routes: "router", router: "router", routers: "router",
  controller: "controller", controllers: "controller",
  middleware: "middleware", middlewares: "middleware",
  service: "service", services: "service", model: "model", models: "model",
};

export const expressAdapter: RepositoryAdapter = {
  ...fallbackAdapter,
  name: "express",
  inspect(file) {
    const folder = file.folder.split("/").reverse().find((part) => roles[part]);
    return { role: folder ? roles[folder] : file.isModule ? "module" : "script", routes: [] };
  },
};
