import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parallel } from "./release-content.mjs";

const photoHost = "www.gtabase.com";
const photoUrl = marker => {
  if (!marker.image) return null;
  const url = new URL(marker.image, `https://${photoHost}`);
  return url.origin === `https://${photoHost}` && /^\/(?:igallery\/gta-6|images\/gta-6\/)/.test(url.pathname) ? url.href : null;
};
const gitHash = bytes => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

/** Attach imagery and descriptions only to a matched GTADB marker. */
export async function attachSupplementalMedia(merged, assets, previousAssets, publicRoot) {
  const photos = new Map(assets.filter(asset => asset.path.includes("/photos/")).map(asset => [asset.upstream, asset]));
  const previous = new Map(previousAssets.filter(asset => asset.path.includes("/photos/")).map(asset => [asset.upstream, asset]));
  const scheduled = new Map();
  for (const { marker, targetId } of merged.attachments) {
    const { landmark } = merged.records.get(targetId);
    const description = marker.description?.replace(/<[^>]*>/g, "").trim();
    if (!landmark.description && description) landmark.description = description;
    const url = photoUrl(marker);
    if (!landmark.gamePhoto && url && !scheduled.has(targetId)) scheduled.set(targetId, { marker, url, landmark });
  }
  const folder = "maps/leonida/photos";
  await mkdir(path.join(publicRoot, folder), { recursive: true });
  const failures = [];
  const fileJobs = new Map();
  async function getPhoto(marker, url) {
    if (photos.has(url)) return photos.get(url);
    const relative = `${folder}/secondary-${marker.id}.webp`;
    const file = path.join(publicRoot, relative);
    const cached = previous.get(url);
    if (cached?.path === relative) {
      const bytes = await readFile(file).catch(() => null);
      if (bytes && gitHash(bytes) === cached.sha) return cached;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await sharp(Buffer.from(await response.arrayBuffer())).rotate()
          .resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        await writeFile(file, bytes);
        return { path: relative, size: bytes.length, sha: gitHash(bytes), upstream: url };
      } catch (error) {
        if (attempt >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt * 1_200));
      }
    }
  }
  await parallel([...scheduled.values()], 8, async ({ marker, url, landmark }) => {
    if (!fileJobs.has(url)) fileJobs.set(url, getPhoto(marker, url));
    try {
      const photo = await fileJobs.get(url);
      photos.set(url, photo);
      landmark.gamePhoto = photo.path;
    } catch (error) {
      failures.push({ id: marker.id, error: error.message });
    }
  });
  const used = new Set([...merged.records.values()].map(record => record.landmark.gamePhoto).filter(Boolean));
  const photosByPath = new Map([...assets, ...photos.values()].filter(asset => used.has(asset.path))
    .map(asset => [asset.path, asset]));
  return { photos: [...photosByPath.values()], failures };
}
