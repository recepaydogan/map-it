import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_GUIDE_SOURCES, GAME_LEGENDS_GUIDE_SUBJECTS } from "../src/game-config.ts";
import { parseJsonc } from "./normalize-bedrock-mechanics.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = GAME_GUIDE_SOURCES.find(entry => entry.gameId === "minecraft-legends");
if (!source) throw new Error("Minecraft Legends guide source is not configured.");

const configuredRoot = process.env.MINECRAFT_LEGENDS_CONTENT_DIR?.trim();
const contentRoot = resolve(configuredRoot || "C:\\XboxGames\\Minecraft Legends - Windows\\Content");
const gameConfig = await readFile(join(contentRoot, "MicrosoftGame.config"), "utf8");
const installedVersion = /<Identity\b[^>]*\bVersion="([0-9.]+)"/i.exec(gameConfig)?.[1];
if (installedVersion !== source.revision)
  throw new Error(`Installed Minecraft Legends ${installedVersion ?? "unknown"} does not match pinned ${source.revision}.`);

const dataRoot = join(contentRoot, "data");
const entityRoot = join(dataRoot, "behavior_packs", "badger", "entities");
const baseResourceRoot = join(dataRoot, "resource_packs", "badger_base");
const textRoot = join(baseResourceRoot, "texts");
const journalIconRoot = join(baseResourceRoot, "textures-hbui", "icons", "resources");
await Promise.all([stat(entityRoot), stat(textRoot), stat(journalIconRoot)]);

const localeFiles = {
  cs: "cs_CZ.lang", da: "da_DK.lang", de: "de_DE.lang", en: "en_US.lang", es: "es_ES.lang", "es-MX": "es_MX.lang",
  fi: "fi_FI.lang", fr: "fr_FR.lang", hu: "hu_HU.lang", id: "id_ID.lang", it: "it_IT.lang", ja: "ja_JP.lang",
  ko: "ko_KR.lang", nl: "nl_NL.lang", no: "nb_NO.lang", pl: "pl_PL.lang", pt: "pt_PT.lang", "pt-BR": "pt_BR.lang",
  ru: "ru_RU.lang", tr: "tr_TR.lang", uk: "uk_UA.lang", "zh-Hans": "zh_CN.lang", "zh-Hant": "zh_TW.lang",
};
const cleanGameText = value => value
  .replace(/\|\[space\]\|/g, " ")
  .replace(/\|\[newline\]\|/g, "\n")
  .replace(/\|[+*]\[[^\]]+\]\|/g, "")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n[ \t]+/g, "\n")
  .replace(/[ \t]{2,}/g, " ")
  .trim();
const parseLang = sourceText => new Map(sourceText.split(/\r?\n/).flatMap(line => {
  const separator = line.indexOf("=");
  if (separator < 1) return [];
  const key = line.slice(0, separator).trim();
  const rawValue = line.slice(separator + 1).split(/\t###/u, 1)[0] ?? "";
  const value = cleanGameText(rawValue);
  return value ? [[key, value]] : [];
}));
const languages = new Map(await Promise.all(Object.entries(localeFiles).map(async ([locale, filename]) =>
  [locale, parseLang(await readFile(join(textRoot, filename), "utf8"))])));

const localizedJournalText = journalId => {
  const prefix = `resources.unlock_journal_${journalId}`;
  const values = Object.fromEntries([...languages].flatMap(([locale, language]) => {
    const name = language.get(`${prefix}.name`);
    if (!name) return [];
    const description = language.get(`${prefix}.description`);
    return [[locale, { name, ...(description ? { description } : {}) }]];
  }));
  if (!values.en) throw new Error(`Missing authoritative English journal name for ${journalId}.`);
  return values;
};

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const provenance = (path, hash) => ({ path, revision: source.revision, sha256: hash,
  url: `${source.sourceUrl}#${encodeURIComponent(path)}` });
const normalizeResource = value => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9_.-]+/g, "_");

const entityDefinitions = new Map(), issues = [];
for (const filename of (await readdir(entityRoot)).filter(entry => entry.endsWith(".json")).sort()) {
  const absolutePath = join(entityRoot, filename), bytes = await readFile(absolutePath);
  try {
    const data = parseJsonc(bytes.toString("utf8"));
    const entity = data?.["minecraft:entity"], id = entity?.description?.identifier;
    if (typeof id === "string" && basename(filename, ".json") === id.split(":")[1])
      entityDefinitions.set(id, { entity, filename, bytes });
  } catch (error) { issues.push({ path: filename, message: error.message }); }
}

const outputRoot = join(projectRoot, "public", "knowledge-data", source.edition, source.version);
const artworkRoot = join(outputRoot, "artwork");
await mkdir(artworkRoot, { recursive: true });
const subjects = new Map(), mechanics = [];
const profileByResource = new Map(GAME_LEGENDS_GUIDE_SUBJECTS.filter(profile => profile.kind === "item")
  .flatMap(profile => profile.sourceIds.map(id => [normalizeResource(id), profile])));

for (const profile of GAME_LEGENDS_GUIDE_SUBJECTS) {
  const text = localizedJournalText(profile.journalId);
  const iconName = `resource_unlock_journal_${profile.journalId}.png`;
  const iconSource = join(journalIconRoot, iconName);
  await stat(iconSource);
  await copyFile(iconSource, join(artworkRoot, `${profile.journalId}.png`));
  const artwork = `/knowledge-data/${source.edition}/${source.version}/artwork/${profile.journalId}.png`;
  subjects.set(`${profile.kind}:${profile.id}`, { kind: profile.kind, id: profile.id, text, artwork });
  if (profile.kind !== "entity") continue;

  const definition = profile.sourceIds.map(id => entityDefinitions.get(id)).find(entry => {
    const costs = entry?.entity?.components?.["badger:spawn_costs"]?.costs;
    return Array.isArray(costs) && costs.length;
  });
  if (!definition) continue;
  const costs = definition.entity.components["badger:spawn_costs"].costs;
  const inputs = costs.map(cost => {
    if (typeof cost?.item !== "string" || !Number.isSafeInteger(cost.amount) || cost.amount < 1) return null;
    const resource = profileByResource.get(normalizeResource(cost.item));
    return resource ? { kind: "item", id: resource.id, count: { min: cost.amount, max: cost.amount } } : null;
  });
  if (inputs.some(input => input === null)) continue;
  const idPath = profile.id.split(":")[1];
  const path = `behavior_pack/entities/${definition.filename}`;
  mechanics.push({ id: `badger:summon/${idPath}`, kind: "interaction", subject: { kind: "entity", id: profile.id }, text,
    requirements: [], inputs, outputs: [], related: [], provenance: provenance(path, sha256(definition.bytes)) });
}

if (!subjects.size || !mechanics.length) throw new Error("Installed Minecraft Legends data produced an empty catalog.");
const artifact = { schemaVersion: 1, kind: "mechanics-catalog", source: { edition: source.edition, version: source.version,
  revision: source.revision, title: "Installed Minecraft Legends gameplay data", url: source.sourceUrl },
subjects: [...subjects.values()], mechanics };
const output = join(outputRoot, "mechanics.json");
await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, subjects: artifact.subjects.length, mechanics: artifact.mechanics.length,
  artwork: artifact.subjects.length, skippedInvalid: issues.length }, null, 2));
