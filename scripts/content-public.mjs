import path from "node:path";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { root, walk, isRemoteContent, sha256File } from "./release-content.mjs";
import { loadContentBuild, shareHostFonts } from "./app-content-build.mjs";

const artworkProfiles = [
  [/^game-cards\/worlds\/[^/]+\.webp$/, 1200, 76],
  [/^game-cards\/catalog\/[^/]+\.webp$/, 360, 78],
  [/^apps\/[^/]+\/(?:item|nightreign)-catalog-art\.webp$/, 1024, 78],
  [/^apps\/[^/]+\/assets\/remove-ads-banner-v2-[\w-]+\.webp$/, 720, 78],
  [/^apps\/aion-2\/class-art\/[^/]+\.webp$/, 480, 72],
  [/^apps\/(?:gta-6\/assets\/leonida-sunset-[\w-]+|rob-run\/artwork\/rob-run-desert)\.webp$/, 1200, 76],
];

export async function optimizeBundledArtwork(relative, bytes) {
  const profile = artworkProfiles.find(([pattern]) => pattern.test(relative));
  if (!profile) return bytes;
  const [, width, quality] = profile;
  const optimized = await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 5 }).toBuffer();
  return optimized.length < bytes.length ? optimized : bytes;
}

/** Copy only the app shell and English files. No CDN content enters new builds. */
export async function copyBundledPublic(output) {
  const publicRoot = path.join(root, "public");
  const content = await loadContentBuild();
  const local = !JSON.parse(await readFile(path.join(root, "content-release.json"), "utf8")).baseUrl;
  let copied = 0, unchanged = 0;
  for (const source of await walk(publicRoot)) {
    const relative = path.relative(publicRoot, source).split(path.sep).join("/");
    if (/^game-cards\/[^/]+\.jpg$/.test(relative)) continue;
    if (content?.omitted.has(relative)) continue;
    if (!local && isRemoteContent(relative)) continue;
    const destination = path.join(output, ...relative.split("/"));
    if (!relative.endsWith(".dll") && (content || relative.startsWith("game-cards/"))) {
      const override = content?.extra[relative];
      const bytes = await optimizeBundledArtwork(relative, await readFile(override?.file || source));
      const body = content ? content.rewrite(relative, bytes) : bytes;
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, body); copied++; continue;
    }
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
  if (content) {
    for (const [relative, entry] of Object.entries(content.extra)) {
      const destination = path.join(output, ...relative.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content.rewrite(relative, await readFile(entry.file)));
    }
    await shareHostFonts(output, content);
    await writeFile(path.join(output, "app-content-release.json"), JSON.stringify({ version: 1, planSha256: content.release.planSha256, apps: content.release.receipts }));
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
