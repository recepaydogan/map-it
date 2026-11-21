/** Verify the selected CDN's UI and native language packs against local sources. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { flatten, validTranslation } from "./ui-locale-utils.mjs";

const read = async file => JSON.parse(await fs.readFile(file, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const release = await read("content-release.json");
const manifest = await read("public/data/locales/phantom-blade-zero/manifest.json");
const english = flatten(await read("src/i18n/locales/en.json"));
const failures = [];
const fetchBytes = async file => {
  const response = await fetch(`${release.baseUrl}/${file}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const manifestBytes = await fetchBytes("release-manifest.json");
if (hash(manifestBytes) !== release.manifestSha256) throw new Error("Selected CDN manifest checksum differs.");
const published = JSON.parse(manifestBytes);
if (published.fingerprint !== release.fingerprint) throw new Error("Selected CDN release differs.");
const files = new Map(published.files.map(file => [file.path, file]));
const verifyFile = async (remotePath, localPath) => {
  const bytes = await fetchBytes(remotePath);
  const checksum = hash(bytes);
  const expected = files.get(remotePath);
  if (!expected || expected.sha256 !== checksum || expected.size !== bytes.length) failures.push(`${remotePath}: CDN manifest mismatch`);
  if (hash(await fs.readFile(localPath)) !== checksum) failures.push(`${remotePath}: differs from current local source`);
  return JSON.parse(bytes);
};
const locales = [];
// Bound network concurrency while checking every supported remote language.
for (let offset = 0; offset < manifest.locales.length; offset += 4) {
  locales.push(...await Promise.all(manifest.locales.slice(offset, offset + 4).map(async locale => {
    if (locale.language === "en") return { language: "en", delivery: "bundled" };
    const ui = flatten(await verifyFile(`locales/${locale.language}.json`, `src/i18n/locales/${locale.language}.json`));
    const invalidKeys = Object.entries(english).filter(([key, text]) => !validTranslation(text, ui[key])).map(([key]) => key);
    if (invalidKeys.length) failures.push(`${locale.language}: missing or invalid UI translations: ${invalidKeys.join(", ")}`);
    await verifyFile(`data/locales/phantom-blade-zero/${locale.code}.json`, `public/data/locales/phantom-blade-zero/${locale.code}.json`);
    return { language: locale.language, delivery: "cdn", uiKeys: Object.keys(english).length, invalidKeys };
  })));
}
const report = { release: release.fingerprint, checkedAt: new Date().toISOString(), locales, failures };
await fs.mkdir("artifacts/localization-2026-10-29", { recursive: true });
await fs.writeFile("artifacts/localization-2026-10-29/published-audit.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
