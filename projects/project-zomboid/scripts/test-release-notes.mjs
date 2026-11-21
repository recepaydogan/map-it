import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { LATEST_RELEASE_VERSION, RELEASE_NOTES } from "../src/features/updates/release-notes.ts";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const packageJson = await readJson("package.json");
const manifest = await readJson("public/manifest.json");
const lockfile = await readJson("package-lock.json");
const english = await readJson("src/i18n/locales/en.json");
const localeFiles = (await readdir(new URL("src/i18n/locales/", root)))
  .filter((file) => file.endsWith(".json"));
const getValue = (locale, key) => key.split(".").reduce((value, part) => value?.[part], locale);

assert.equal(LATEST_RELEASE_VERSION, packageJson.version, "Latest release must match the package version.");
assert.equal(manifest.meta.version, packageJson.version, "Manifest version must match the package version.");
assert.equal(lockfile.version, packageJson.version, "Lockfile version must match the package version.");
assert.equal(lockfile.packages[""].version, packageJson.version, "Root lock entry must match the package version.");
assert.equal(new Set(RELEASE_NOTES.map((release) => release.version)).size, RELEASE_NOTES.length);

for (const release of RELEASE_NOTES) {
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
  assert.equal(release.translationKey, `updates.releases.v${release.version.replaceAll(".", "")}`);
  assert.equal(new Date(release.publishedAt).toISOString().slice(0, 10), release.publishedAt);
  const bodyKey = `${release.translationKey}.body`;
  for (const file of localeFiles) {
    const locale = await readJson(`src/i18n/locales/${file}`);
    const body = getValue(locale, bodyKey);
    assert.equal(typeof body, "string", `${file}: missing ${bodyKey}`);
    assert.ok(body.trim().length > 0, `${file}: empty release notes`);
    if (file !== "en.json") {
      assert.notEqual(body, getValue(english, bodyKey), `${file}: release notes must be translated, not copied from English.`);
    }
  }
}

console.log(`Release notes passed: version ${LATEST_RELEASE_VERSION}, ${localeFiles.length} languages.`);
