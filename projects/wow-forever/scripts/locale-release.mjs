import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const localeRoots = [
  "data/locales/wow-forever", "data/classes/locales", "data/classes/guides/locales",
  "data/guides/locales", "data/spells/writeups/locales",
];

export const isLocaleContent = (filename) => localeRoots.some((root) =>
  filename === root || filename.startsWith(`${root}/`));

export async function verifyLocaleRelease(root, origin, fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Locale CDN: HTTP ${response.status} at ${url}`);
  return response.json();
}, { matchLocalFiles = true } = {}) {
  const channel = await fetchJson(`${origin}/locales/wow-forever/current.json`);
  if (channel.version !== 1 || !/^[a-f0-9]{24}$/.test(channel.fingerprint ?? "")) {
    throw new Error("Invalid published locale channel.");
  }
  const baseUrl = `${origin}/releases/${channel.fingerprint}`;
  const manifest = await fetchJson(`${baseUrl}/release-manifest.json`);
  if (manifest.fingerprint !== channel.fingerprint || !Array.isArray(manifest.files)) {
    throw new Error("Invalid published locale manifest.");
  }
  const published = new Map(manifest.files.map((file) => [file.path, file]));
  const verifyDirectory = async (relative) => {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const filename = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await verifyDirectory(filename);
      else if (entry.isFile()) {
        const remote = published.get(filename);
        const bytes = matchLocalFiles ? await fs.readFile(path.join(root, filename)) : undefined;
        if (!remote || !Number.isInteger(remote.size) || remote.size <= 0 ||
          !/^[a-f0-9]{64}$/.test(remote.sha256 ?? "") ||
          (bytes && (remote.size !== bytes.length ||
            remote.sha256 !== createHash("sha256").update(bytes).digest("hex")))) {
          throw new Error(`Publish current locales before packaging: ${filename}. Run npm run publish:locales.`);
        }
      } else throw new Error(`Unsupported locale entry: ${filename}`);
    }
  };
  for (const directory of localeRoots) await verifyDirectory(directory);
  return baseUrl;
}
