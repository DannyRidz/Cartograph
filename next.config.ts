import type { NextConfig } from "next";
import { getEnvironment } from "./lib/environment";

if (Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error("Cartograph requires Node 22 or newer. Run nvm use to select the project's Node 24 runtime.");
}
getEnvironment();

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
