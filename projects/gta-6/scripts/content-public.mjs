import path from "node:path";
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { root, walk, isRemoteContent, sha256File } from "./release-content.mjs";

/** Copy only the app shell and English files. No CDN content enters new builds. */
export async function copyBundledPublic(output) {
  const publicRoot = path.join(root, "public");
  const local = !JSON.parse(await readFile(path.join(root, "content-release.json"), "utf8")).baseUrl;
  let copied = 0, unchanged = 0;
  for (const source of await walk(publicRoot)) {
    const relative = path.relative(publicRoot, source).split(path.sep).join("/");
    if (!local && isRemoteContent(relative)) continue;
    const destination = path.join(output, ...relative.split("/"));
    let exists = false;
    try { exists = (await sha256File(source)) === (await sha256File(destination)); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (exists) { unchanged++; continue; }
    if (source.endsWith(".dll")) {
      const parent = await readdir(path.dirname(destination)).catch(() => []);
      if (parent.includes(path.basename(destination))) throw new Error(`Refusing to replace a loaded DLL: ${relative}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
    copied++;
  }
  await cp(path.join(root, "content-release.json"), path.join(output, "content-release.json"));
  console.log(`[app-public] ${copied} copied, ${unchanged} unchanged; English stays bundled.`);
}

export async function verifyPublishedPlan(plan, env) {
  const pinned = JSON.parse(await readFile(path.join(root, "content-release.json"), "utf8"));
  if (!pinned.baseUrl || (plan && pinned.fingerprint !== plan.fingerprint)) {
    throw new Error("Content changed or is unpublished. Run npm run publish:content -- --upload before building.");
  }
  const requested = env.VITE_CONTENT_BASE_URL?.trim();
  if (requested && requested.replace(/\/+$/, "") !== pinned.baseUrl) {
    throw new Error("VITE_CONTENT_BASE_URL differs from the verified content release.");
  }
  const response = await fetch(`${pinned.baseUrl}/release-manifest.json`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Published content manifest unavailable: HTTP ${response.status}.`);
  const body = Buffer.from(await response.arrayBuffer());
  const { digest, manifestBytes } = await import("./release-content.mjs");
  if (digest(body) !== pinned.manifestSha256 || (plan && !body.equals(manifestBytes(plan)))) {
    throw new Error("Published content manifest does not match this app's source files.");
  }
  return pinned;
}
