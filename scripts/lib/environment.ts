import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Resolve Next's own loader, so scripts share its precedence and expansion
// without adding a second environment loader dependency.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const loader: { loadEnvConfig: (directory: string, development: boolean) => unknown } = nextRequire("@next/env");
loader.loadEnvConfig(fileURLToPath(new URL("../../", import.meta.url)), process.env.NODE_ENV !== "production");
