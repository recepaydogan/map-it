/** Review changed Wowhead quest locale fields against the active CDN release. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { isEnglishQuestProseFallback } from "./lib/wowhead-quest-prose-page.mjs";
import { isRejectedSemanticProse } from "./lib/rejected-semantic-prose.mjs";
import { directSpanishWowheadQuestField, regionalSpanishQuestUrl } from "./lib/regional-quest-fallbacks.mjs";
import { releaseContentBaseUrl } from "./upload-release-content.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const scopePath = process.argv[2];
if (!scopePath) throw new Error("Pass the output scope JSON path");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const env = loadEnv("production", root, "");
const origin = new URL(env.R2_PUBLIC_ORIGIN).origin;
const pointerResponse = await fetch(`${origin}/locales/wow-forever/current.json`, { cache: "no-store" });
if (!pointerResponse.ok) throw new Error(`Locale channel HTTP ${pointerResponse.status}`);
const pointer = await pointerResponse.json();
if (pointer.version !== 1 || !/^[a-f0-9]{24}$/.test(pointer.fingerprint)) {
  throw new Error("Invalid locale channel");
}
const base = releaseContentBaseUrl(origin, pointer.fingerprint);
const manifestResponse = await fetch(`${base}/release-manifest.json`);
if (!manifestResponse.ok) throw new Error(`Locale manifest HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.fingerprint !== pointer.fingerprint || !Array.isArray(manifest.files)) {
  throw new Error("Invalid locale manifest");
}
const baseline = new Map(manifest.files.map((entry) => [entry.path, entry]));
const quests = JSON.parse(await readFile(join(root, "public/data/quests/quest-details.json"), "utf8")).quests;
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const names = ["quest-prose-wowhead", "quest-objective-wowhead"].flatMap((type) =>
  locales.map((locale) => ({ path: `data/locales/wow-forever/${type}-${locale}.json`, locale })));
const spanishDonors = await Promise.all(["quest-prose-wowhead-esES",
  "quest-objective-wowhead-esES", "quest-prose-wowhead"].map(async (name) =>
  JSON.parse(await readFile(join(root, `public/data/locales/wow-forever/${name}.json`), "utf8"))));
const objectivePacks = Object.fromEntries(await Promise.all(locales.map(async (locale) => {
  const path = join(root, `public/data/locales/wow-forever/quest-objective-wowhead-${locale}.json`);
  return [locale, JSON.parse(await readFile(path, "utf8"))];
})));
const scope = { version: 1, files: [] };
const summaries = [];
for (const { path, locale } of names) {
  const localPath = `public/${path}`;
  const bytes = await readFile(join(root, localPath));
  const pack = JSON.parse(bytes.toString("utf8"));
  const old = baseline.get(path);
  if (!old || pack.version !== 1 || !pack.quests) throw new Error(`Invalid locale pack: ${path}`);
  for (const [id, entry] of Object.entries(pack.quests)) {
    if (entry.reusedFieldSources?.objective ||
      (entry.reusedFromQuestId && Object.keys(entry.reusedFieldSources ?? {}).length)) {
      throw new Error(`Unsupported objective source metadata: ${path} ${id}`);
    }
    if (path.includes("quest-objective-wowhead-") && entry.reusedFromQuestId) {
      const donor = pack.quests[entry.reusedFromQuestId];
      if (!donor || donor.reusedFromQuestId ||
        entry.sourceUrl !== `https://www.wowhead.com/forever/quest=${id}` ||
        entry.english?.objective !== quests[id]?.objective ||
        donor.english?.objective !== entry.english.objective ||
        donor.locales?.[locale]?.objective !== entry.locales?.[locale]?.objective ||
        donor.localeUrls?.[locale] !== entry.localeUrls?.[locale]) {
        throw new Error(`Unverified reused objective: ${path} ${id}`);
      }
    }
    if (entry.regionalFallbackFields && locale !== "esMX") {
      throw new Error(`Unexpected regional fallback: ${path} ${id}`);
    }
    for (const [field, source] of Object.entries(entry.regionalFallbackFields ?? {})) {
      const english = entry.english?.[field];
      const value = entry.locales?.esMX?.[field];
      if (source?.locale !== "esES" || source.localeUrl !== regionalSpanishQuestUrl(id) ||
        english !== quests[id]?.[field] ||
        value !== directSpanishWowheadQuestField(spanishDonors, id, field, english)) {
        throw new Error(`Unverified regional fallback: ${path} ${id}/${field}`);
      }
    }
    for (const [field, value] of Object.entries(entry.locales?.[locale] ?? {})) {
      if (entry.english?.[field] !== quests[id]?.[field] ||
        isEnglishQuestProseFallback(value, entry.english[field])) {
        throw new Error(`Invalid localized field: ${path} ${id}/${field}`);
      }
    }
  }
  const localSha = sha(bytes);
  if (localSha === old.sha256) continue;
  const response = await fetch(`${base}/${path}`);
  const oldBytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || oldBytes.length !== old.size || sha(oldBytes) !== old.sha256) {
    throw new Error(`Published locale does not match manifest: ${path}`);
  }
  const published = JSON.parse(oldBytes.toString("utf8"));
  const counts = { added: 0, regionalAdded: 0, repaired: 0, removedFallback: 0,
    movedObjectiveToPack: 0,
    removedSemanticMismatch: 0, repairedSemanticMismatch: 0,
    removedInvalidObjectiveReuse: 0, upgradedRegionalFallback: 0 };
  const ids = new Set([...Object.keys(published.quests), ...Object.keys(pack.quests)]);
  for (const id of ids) {
    const before = published.quests[id];
    const after = pack.quests[id];
    const fields = new Set([...Object.keys(before?.locales?.[locale] ?? {}),
      ...Object.keys(after?.locales?.[locale] ?? {})]);
    for (const field of fields) {
      const previous = before?.locales?.[locale]?.[field];
      const current = after?.locales?.[locale]?.[field];
      const wasRegional = Boolean(before?.regionalFallbackFields?.[field]);
      const isRegional = Boolean(after?.regionalFallbackFields?.[field]);
      if (previous === current && wasRegional === isRegional) continue;
      if (wasRegional && current && !isRegional &&
        after?.localeUrls?.esMX?.startsWith("https://www.wowhead.com/forever/mx/quest=")) {
        counts.upgradedRegionalFallback++;
        continue;
      }
      const movedObjective = field === "objective" && path.includes("quest-prose-wowhead-") &&
        objectivePacks[locale].quests[id]?.english?.objective === before?.english?.objective &&
        objectivePacks[locale].quests[id]?.locales?.[locale]?.objective;
      if (previous && !current && movedObjective &&
        (previous === movedObjective || wasRegional)) counts.movedObjectiveToPack++;
      else if (previous && !current &&
        isEnglishQuestProseFallback(previous, before?.english?.[field])) counts.removedFallback++;
      else if (previous && !current &&
        isRejectedSemanticProse(id, locale, field, before?.english?.[field], previous)) {
        counts.removedSemanticMismatch++;
      }
      else if (previous && current &&
        isRejectedSemanticProse(id, locale, field, before?.english?.[field], previous)) {
        const donor = pack.quests[after?.reusedFromQuestId];
        if (!donor || donor.reusedFromQuestId || donor.english?.[field] !== after.english?.[field] ||
          donor.locales?.[locale]?.[field] !== current ||
          donor.localeUrls?.[locale] !== after.localeUrls?.[locale]) {
          throw new Error(`Unverified semantic repair: ${path} ${id}/${field}`);
        }
        counts.repairedSemanticMismatch++;
      }
      else if (field === "objective" && previous && !current &&
        before?.reusedFieldSources?.objective) counts.removedInvalidObjectiveReuse++;
      else if (!previous && current) {
        if (isRegional) counts.regionalAdded++;
        else counts.added++;
      }
      else if (previous && current &&
        isEnglishQuestProseFallback(previous, before?.english?.[field])) counts.repaired++;
      else throw new Error(`Unreviewed locale change: ${path} ${id}/${field}`);
    }
  }
  if (!Object.values(counts).some(Boolean)) throw new Error(`Metadata-only locale change: ${path}`);
  scope.files.push({ path, localPath, sha256: localSha });
  summaries.push({ path, ...counts });
}
await writeFile(scopePath, `${JSON.stringify(scope, null, 2)}\n`);
console.log(JSON.stringify({ baseline: pointer.fingerprint, files: summaries.length, summaries }));
