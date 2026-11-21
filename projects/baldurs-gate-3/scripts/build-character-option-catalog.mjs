import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const result = new Map();
  const repeated = new Map([
    ["--tag-source", []],
    ["--class-source", []],
    ["--race-source", []],
    ["--preset-source", []],
  ]);
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    if (repeated.has(key)) repeated.get(key).push(value);
    else result.set(key.slice(2), value);
  }
  for (const [key, entries] of repeated) {
    if (entries.length === 0) throw new Error(`At least one ${key} input is required.`);
    result.set(key.slice(2), entries);
  }
  for (const required of ["localization-en", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return result;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

const attributeValue = (value, fallback = undefined) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return fallback;
  return value.value ?? value.handle ?? fallback;
};

const normalizedId = (value) => value?.toLocaleLowerCase("en-US");
const unique = (values) => [...new Set(values.filter(Boolean))];

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const stripLocalizationMarkup = (value) => decodeXml(value)
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

const readLocalization = (filePath) => {
  const xml = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  const pattern = /<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g;
  for (const match of xml.matchAll(pattern)) entries.set(match[1], stripLocalizationMarkup(match[2]));
  return entries;
};

const readTags = (sources) => {
  const tags = new Map();
  for (const source of sources) {
    const files = walkFiles(source)
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsj"))
      .sort((left, right) => left.localeCompare(right, "en"));
    for (const filePath of files) {
      const tag = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.Tags;
      const id = normalizedId(attributeValue(tag?.UUID));
      if (!id) continue;
      tags.set(id, {
        id,
        internalName: attributeValue(tag.Name),
        displayNameHandle: tag.DisplayName?.handle,
        categories: unique((tag.Categories ?? []).flatMap((container) => container.Category ?? [])
          .map((category) => attributeValue(category.Name))),
        provenance: path.relative(source, filePath).split(path.sep).join("/"),
      });
    }
  }
  return tags;
};

/** Larian LSX files use stable indentation for sibling resource nodes. Keeping
 * the extraction line-oriented avoids introducing a runtime XML dependency to
 * the repeatable data pipeline. */
const splitLsxNodes = (xml, nodeId) => {
  const lines = xml.split(/\r?\n/);
  const candidates = lines
    .map((line, index) => ({ index, indent: line.match(/^\s*/)?.[0].length ?? 0, value: line.trim() }))
    .filter((line) => line.value === `<node id="${nodeId}">`);
  if (candidates.length === 0) return [];
  const outerIndent = Math.min(...candidates.map((candidate) => candidate.indent));
  const starts = candidates.filter((candidate) => candidate.indent === outerIndent).map((candidate) => candidate.index);
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join("\n"));
};

const readAttribute = (body, id) => body.match(new RegExp(`<attribute\\s+id="${id}"[^>]*(?:value|handle)="([^"]+)"`))?.[1];
const readTagIds = (body) => unique([...body.matchAll(/<node\s+id="Tags">[\s\S]*?<attribute\s+id="Object"[^>]*\svalue="([^"]+)"/g)]
  .map((match) => normalizedId(match[1])));

const readClassDefinitions = (sources) => {
  const definitions = new Map();
  for (const source of sources) {
    const xml = fs.readFileSync(source, "utf8");
    for (const body of splitLsxNodes(xml, "ClassDescription")) {
      const id = normalizedId(readAttribute(body, "UUID"));
      if (!id) continue;
      definitions.set(id, {
        id,
        internalName: readAttribute(body, "Name"),
        parentId: normalizedId(readAttribute(body, "ParentGuid")),
        displayNameHandle: readAttribute(body, "DisplayName"),
        descriptionHandle: readAttribute(body, "Description"),
        tagIds: readTagIds(body),
        provenance: path.basename(source),
      });
    }
  }
  return definitions;
};

const readRaceDefinitions = (sources) => {
  const definitions = new Map();
  for (const source of sources) {
    const xml = fs.readFileSync(source, "utf8");
    for (const body of splitLsxNodes(xml, "Race")) {
      const id = normalizedId(readAttribute(body, "UUID"));
      if (!id) continue;
      definitions.set(id, {
        id,
        internalName: readAttribute(body, "Name"),
        parentId: normalizedId(readAttribute(body, "ParentGuid")),
        displayNameHandle: readAttribute(body, "DisplayName"),
        descriptionHandle: readAttribute(body, "Description"),
        tagIds: readTagIds(body),
        provenance: path.basename(source),
      });
    }
  }
  return definitions;
};

const readPlayableRaceIds = (sources) => {
  const ids = new Set();
  for (const source of sources) {
    const xml = fs.readFileSync(source, "utf8");
    for (const match of xml.matchAll(/<attribute\s+id="(?:RaceUUID|SubRaceUUID)"[^>]*\svalue="([^"]+)"/g)) {
      const id = normalizedId(match[1]);
      if (id && id !== "00000000-0000-0000-0000-000000000000") ids.add(id);
    }
  }
  return ids;
};

const localize = (handle, localization) => Object.fromEntries(Object.entries({
  en: handle ? localization.en.get(handle) : undefined,
  tr: handle ? localization.tr.get(handle) : undefined,
}).filter(([, value]) => value));

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const resolveAll = (key) => arguments_.get(key).map((entry) => path.resolve(entry));
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: arguments_.has("localization-tr")
      ? readLocalization(path.resolve(arguments_.get("localization-tr")))
      : new Map(),
  };
  const tags = readTags(resolveAll("tag-source"));
  const classes = readClassDefinitions(resolveAll("class-source"));
  const races = readRaceDefinitions(resolveAll("race-source"));
  const playableRaceIds = readPlayableRaceIds(resolveAll("preset-source"));
  const options = {};
  const addOption = (definition, kind) => {
    for (const tagId of definition.tagIds) {
      const tag = tags.get(tagId);
      if (!tag) continue;
      const categoryMatchesKind = kind === "class"
        ? tag.categories.includes("Class")
        : tag.categories.includes("PlayerRace") || tag.categories.includes("Race");
      if (!categoryMatchesKind) continue;
      options[tagId] = {
        id: tagId,
        kind,
        internalName: tag.internalName,
        definitionId: definition.id,
        definitionInternalName: definition.internalName,
        parentDefinitionId: definition.parentId,
        localizedNames: localize(definition.displayNameHandle || tag.displayNameHandle, localization),
        localizedDescriptions: localize(definition.descriptionHandle, localization),
        provenance: {
          definition: definition.provenance,
          tag: tag.provenance,
        },
      };
    }
  };

  for (const definition of classes.values()) {
    if (!definition.parentId) addOption(definition, "class");
  }
  for (const definition of races.values()) {
    if (playableRaceIds.has(definition.id)) addOption(definition, "race");
  }

  const outputPath = path.resolve(arguments_.get("output"));
  const optionValues = Object.values(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    stats: {
      tags: tags.size,
      classDefinitions: classes.size,
      baseClasses: optionValues.filter((option) => option.kind === "class").length,
      raceDefinitions: races.size,
      playableRaceDefinitions: playableRaceIds.size,
      playableRaceTags: optionValues.filter((option) => option.kind === "race").length,
    },
    options,
  }, null, 2)}\n`);
  console.log(`Character options: ${optionValues.filter((option) => option.kind === "class").length} base class tags and ${optionValues.filter((option) => option.kind === "race").length} playable race tags.`);
};

try {
  main();
} catch (error) {
  console.error("Character option catalog build failed:", error);
  process.exitCode = 1;
}
