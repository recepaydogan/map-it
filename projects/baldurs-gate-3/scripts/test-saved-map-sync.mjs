import { build } from "esbuild";

const result = await build({
  entryPoints: ["scripts/test-saved-map-sync.mts"], bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "fake-cloud", setup(builder) {
    builder.onResolve({ filter: /\/supabase-client$/ }, () => ({ path: "client", namespace: "fake" }));
    builder.onResolve({ filter: /\/game-config$/ }, () => ({ path: "config", namespace: "fake" }));
    builder.onLoad({ filter: /.*/, namespace: "fake" }, ({ path }) => ({ contents: path === "client"
      ? "export const getSupabaseClient = () => globalThis.testCloud;"
      : 'export const GAME_CONFIG = { appSlug: "test-app" };' }));
  } }],
});
try {
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
