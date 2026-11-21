import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const output = resolve("node_modules/.cache/inspector-test-bundle.mjs");
await mkdir(resolve("node_modules/.cache"), { recursive: true });
await build({
  entryPoints: [resolve("scripts/test-inspector.mjs")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
await import(pathToFileURL(output).href);
