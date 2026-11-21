import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_TO_LOCALE = {
  AR: "es-AR",
  CA: "ca",
  CH: "zh-Hant",
  CN: "zh-Hans",
  CS: "cs",
  DA: "da",
  DE: "de",
  EN: "en",
  ES: "es",
  ES_CL: "es-CL",
  ES_MX: "es-MX",
  FI: "fi",
  FR: "fr",
  HU: "hu",
  ID: "id",
  IT: "it",
  JP: "ja",
  KO: "ko",
  NL: "nl",
  NO: "no",
  PL: "pl",
  PT: "pt",
  PTBR: "pt-BR",
  RO: "ro",
  RU: "ru",
  STREW: "strew",
  TH: "th",
  TR: "tr",
  UA: "uk",
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const normalizeIdentifier = (value) => value.replace(/[^a-z0-9]/gi, "").toLowerCase();

const getProfessionLabels = (translations) => {
  const labels = new Map();
  for (const [key, label] of Object.entries(translations)) {
    if (!key.startsWith("UI_prof_") || key.startsWith("UI_profdesc_") || typeof label !== "string") continue;
    labels.set(normalizeIdentifier(key.slice("UI_prof_".length)), label);
  }
  return labels;
};

const getProfessionLabel = (profession, labels) => {
  const normalized = normalizeIdentifier(profession);
  const alias = normalized === "policeofficer"
    ? "policeoff"
    : normalized === "fireofficer" ? "fireoff" : normalized;
  return labels.get(alias) ?? labels.get(normalized);
};

const getVehicleLabel = (vehicleId, translations) => {
  const scriptName = vehicleId.replace(/^Base[.]/, "");
  return translations[`IGUI_VehicleName${scriptName}`]
    ?? translations[`IGUI_VehicleName${scriptName.replace(/Burnt/g, "")}`];
};

const townTranslationKey = (townId) => `MapLabel_${townId
  .split("-")
  .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
  .join("")}`;

const definedEntries = (entries) => Object.fromEntries(entries.filter(([, value]) => typeof value === "string"));

export const extractGameContentLocales = ({ gameRoot, metadata, targetRoot }) => {
  const translateRoot = join(gameRoot, "media", "lua", "shared", "Translate");
  const outputRoot = join(targetRoot, "locales");
  rmSync(outputRoot, { recursive: true, force: true });
  mkdirSync(outputRoot, { recursive: true });

  const availableSources = new Set(
    readdirSync(translateRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );
  const languages = [];

  for (const [sourceCode, code] of Object.entries(SOURCE_TO_LOCALE)) {
    if (!availableSources.has(sourceCode)) continue;
    const languageRoot = join(translateRoot, sourceCode);
    const language = readJson(join(languageRoot, "language.json"));
    languages.push({ code, name: language.language_name || code });
    if (code === "en") continue;

    const itemNames = readJson(join(languageRoot, "ItemName.json"));
    const recipeNames = readJson(join(languageRoot, "Recipes.json"));
    const vehicleNames = readJson(join(languageRoot, "IG_UI.json"));
    const uiNames = readJson(join(languageRoot, "UI.json"));
    const mapLabels = readJson(join(languageRoot, "MapLabel.json"));
    const professionLabels = getProfessionLabels(uiNames);
    const vehicleIds = new Set(
      metadata.vehicleSpawns.definitions.flatMap((definition) => definition.vehicles.map((vehicle) => vehicle.id)),
    );

    const overlay = {
      items: definedEntries(metadata.items.map((item) => [item.id, itemNames[item.id]])),
      recipes: definedEntries(metadata.crafting.recipes.map((recipe) => [recipe.id, recipeNames[recipe.recipeId]])),
      vehicles: definedEntries([...vehicleIds].map((id) => [id, getVehicleLabel(id, vehicleNames)])),
      professions: definedEntries(
        metadata.spawnPoints.professions.map((profession) => [profession.id, getProfessionLabel(profession.id, professionLabels)]),
      ),
      towns: definedEntries(metadata.towns.map((town) => [town.id, mapLabels[townTranslationKey(town.id)]])),
    };
    writeFileSync(join(outputRoot, `${code}.json`), JSON.stringify(overlay));
  }

  writeFileSync(join(outputRoot, "index.json"), JSON.stringify({ languages }));
  return languages.length;
};
