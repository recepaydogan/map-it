import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

export async function verifyReleaseDungeonArtwork(dist, catalog, remoteContent) {
  const assets = path.join(dist, "assets");
  const resolvers = (await readdir(assets)).filter((name) => /^content-url-.+\.js$/.test(name));
  if (resolvers.length !== 1) throw new Error("Expected one compiled content URL resolver in the OPK build.");
  const { contentUrl } = await import(pathToFileURL(path.join(assets, resolvers[0])).href);
  const floors = catalog.flatMap(({ floors }) => floors);
  if (!floors.length) throw new Error("The dungeon map catalog is empty.");

  const verifyFloor = async ({ image, width, height }) => {
    const url = contentUrl(image);
    try {
      let bytes;
      if (remoteContent) {
        if (new URL(url).protocol !== "https:") throw new Error("Expected an HTTPS CDN image.");
        const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (!response.headers.get("content-type")?.startsWith("image/")) {
          throw new Error("The CDN response is not an image.");
        }
        bytes = Buffer.from(await response.arrayBuffer());
      } else {
        if (!/^\/(?:maps\/dungeons\/)[\w.-]+$/.test(url)) throw new Error("Expected a packaged dungeon image.");
        bytes = await readFile(path.join(dist, url.slice(1)));
      }
      const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      if (info.width !== width || info.height !== height) {
        throw new Error(`Expected ${width}×${height}, received ${info.width}×${info.height}.`);
      }
    } catch (error) {
      throw new Error(`Dungeon artwork ${image} failed at ${url}: ${error.message}`, { cause: error });
    }
  };

  for (let index = 0; index < floors.length; index += 6) {
    await Promise.all(floors.slice(index, index + 6).map(verifyFloor));
  }
  console.log(`Verified ${floors.length} dungeon floor images using the compiled OPK resolver.`);
}
