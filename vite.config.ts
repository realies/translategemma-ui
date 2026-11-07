import { basename, dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";

const WORKER_URL = /new URL\("(\.\/[\w.-]+\.worker\.ts)", import\.meta\.url\)/g;

/**
 * Vite bundles `new URL("./x.worker.ts", import.meta.url)` workers for the browser only. This
 * emits them as chunks of the server build too, and points the URL at the emitted file,
 * relative to the importing chunk. Dev and tests run the TypeScript source directly.
 */
function serverWorkers(): Plugin {
  const refs = new Set<string>();
  return {
    name: "server-workers",
    apply: "build",
    enforce: "pre", // resolveFileUrl must answer before Vite's base-relative asset URLs
    applyToEnvironment: (environment) => environment.config.consumer === "server",
    transform(code, id) {
      const out = code.replace(WORKER_URL, (_, file: string) => {
        const ref = this.emitFile({
          type: "chunk",
          id: resolve(dirname(id), file),
          name: basename(file, ".ts"),
        });
        refs.add(ref);
        return `new URL(import.meta.ROLLUP_FILE_URL_${ref})`;
      });
      return out === code ? null : { code: out, map: null };
    },
    resolveFileUrl({ referenceId, relativePath }) {
      if (!refs.has(referenceId)) return null;
      return `new URL(${JSON.stringify(`./${relativePath}`)}, import.meta.url).href`;
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), serverWorkers()],
});
