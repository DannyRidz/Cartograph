import type { RepositoryFile } from "../parser/types.ts";

/**
 * Returns conventional framework entry and config paths to exclude from unimported insights.
 * These conventions are not proof of execution and stay outside parsing and graph arithmetic.
 */
export function conventionalEntryFiles(files: RepositoryFile[]): Set<string> {
  const source = "\\.(?:[cm]?[jt]s|[jt]sx)$";
  const appEntry = new RegExp(`(?:^|/)app/(?:.*/)?(?:page|route|layout|template|loading|error|global-error|not-found|default|forbidden|unauthorized|sitemap|robots|manifest|icon|apple-icon|opengraph-image|twitter-image)${source}`);
  const pagesEntry = new RegExp(`(?:^|/)pages/.+${source}`);
  const middleware = new RegExp(`^(?:src/)?(?:middleware|proxy|instrumentation|instrumentation-client)${source}`);
  const config = new RegExp(`(?:^|/)(?:(?:next|eslint|postcss|tailwind|vite|vitest|webpack|rollup|babel|jest|playwright|prettier|astro|svelte|nuxt|remix|tsdown)\\.config|(?:jest|vitest)\\.setup|\\.size-limit)${source}`);
  const roots = new Set([""]);
  for (const file of files) {
    const entry = /^(.*?)(?:src\/)?(?:app|pages)\//.exec(file.path);
    const nextConfig = /^(.*)next\.config\.[cm]?[jt]s$/.exec(file.path);
    if (entry) roots.add(entry[1]);
    if (nextConfig) roots.add(nextConfig[1]);
  }
  return new Set(files.filter((file) => appEntry.test(file.path) || pagesEntry.test(file.path)
    || [...roots].some((root) => file.path.startsWith(root) && middleware.test(file.path.slice(root.length)))
    || config.test(file.path)).map((file) => file.path));
}
