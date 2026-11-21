import fs from "node:fs";
import path from "node:path";

const parseArguments = (values) => {
  const arguments_ = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    arguments_.set(key.slice(2), value);
  }
  for (const required of ["source", "localization-en", "output"]) {
    if (!arguments_.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  return arguments_;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });

const modulePriority = (filePath) => {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.includes("/Shared/")) return 0;
  if (normalized.includes("/SharedDev/")) return 1;
  if (normalized.includes("/Gustav/")) return 2;
  if (normalized.includes("/GustavDev/")) return 3;
  if (normalized.includes("/GustavX/")) return 4;
  if (normalized.includes("/Honour/")) return 5;
  return 6;
};

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", "\"")
  .replaceAll("&apos;", "'")
  .replaceAll("&amp;", "&");

const readLocalization = (filePath) => {
  if (!filePath) return new Map();
  const entries = new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  for (const match of xml.matchAll(/<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g)) {
    entries.set(match[1], decodeXml(match[2])
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim());
  }
  return entries;
};

const attributeValue = (object, name, fallback = "") => {
  const attribute = object?.[name];
  if (!attribute || Array.isArray(attribute)) return fallback;
  return attribute.value ?? attribute.handle ?? fallback;
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sourceRoot = path.resolve(arguments_.get("source"));
  const outputPath = path.resolve(arguments_.get("output"));
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: readLocalization(arguments_.get("localization-tr")
      ? path.resolve(arguments_.get("localization-tr"))
      : undefined),
  };
  const files = walkFiles(sourceRoot)
    .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsj"))
    .sort((left, right) => modulePriority(left) - modulePriority(right)
      || left.localeCompare(right, "en"));
  const rawTemplates = new Map();

  for (const filePath of files) {
    const objects = JSON.parse(fs.readFileSync(filePath, "utf8"))?.save?.regions?.Templates?.GameObjects;
    if (!Array.isArray(objects)) throw new Error(`Templates.GameObjects was not found in ${filePath}.`);
    for (const object of objects) {
      const id = attributeValue(object, "MapKey").toLocaleLowerCase("en-US");
      if (!id) continue;
      const previous = rawTemplates.get(id) ?? {};
      rawTemplates.set(id, {
        ...previous,
        id,
        internalName: attributeValue(object, "Name") || previous.internalName || "",
        parentTemplateId: attributeValue(object, "ParentTemplateId").toLocaleLowerCase("en-US")
          || previous.parentTemplateId || "",
        displayNameHandle: attributeValue(object, "DisplayName") || previous.displayNameHandle || "",
        descriptionHandle: attributeValue(object, "Description") || previous.descriptionHandle || "",
        stats: Object.hasOwn(object, "Stats") ? attributeValue(object, "Stats") : previous.stats,
        // The identically named child node contains visual sets, not Stats
        // equipment. Only the scalar attribute selects an equipment definition.
        equipmentId: Object.hasOwn(object, "Equipment") && !Array.isArray(object.Equipment)
          ? attributeValue(object, "Equipment") : previous.equipmentId,
        equipmentLootable: Object.hasOwn(object, "IsEquipmentLootable")
          ? attributeValue(object, "IsEquipmentLootable", false) === true : previous.equipmentLootable,
        icon: attributeValue(object, "Icon") || previous.icon || "",
        type: attributeValue(object, "Type") || previous.type || "",
        subLevelName: attributeValue(object, "SubLevelName") || previous.subLevelName || "",
        isTrap: Object.hasOwn(object, "IsTrap")
          ? attributeValue(object, "IsTrap", false) === true
          : previous.isTrap,
        disarmDifficultyClassId: Object.hasOwn(object, "DisarmDifficultyClassID")
          ? String(attributeValue(object, "DisarmDifficultyClassID", "")).toLocaleLowerCase("en-US")
          : previous.disarmDifficultyClassId,
        hasDisarmDifficultyClassId: Object.hasOwn(object, "DisarmDifficultyClassID")
          || previous.hasDisarmDifficultyClassId,
        provenance: path.relative(sourceRoot, filePath).split(path.sep).join("/"),
      });
    }
  }

  const resolvedTemplates = new Map();
  const resolveTemplate = (id, stack = new Set()) => {
    if (resolvedTemplates.has(id)) return resolvedTemplates.get(id);
    const raw = rawTemplates.get(id);
    if (!raw || stack.has(id)) return null;
    stack.add(id);
    const parent = raw.parentTemplateId ? resolveTemplate(raw.parentTemplateId, stack) : null;
    stack.delete(id);
    const displayNameHandle = raw.displayNameHandle || parent?.displayNameHandle || "";
    const descriptionHandle = raw.descriptionHandle || parent?.descriptionHandle || "";
    const resolved = {
      id,
      internalName: raw.internalName || parent?.internalName || "",
      parentTemplateId: raw.parentTemplateId || undefined,
      displayNameHandle: displayNameHandle || undefined,
      displayName: {
        en: localization.en.get(displayNameHandle) ?? "",
        tr: localization.tr.get(displayNameHandle) ?? "",
      },
      descriptionHandle: descriptionHandle || undefined,
      description: {
        en: localization.en.get(descriptionHandle) ?? "",
        tr: localization.tr.get(descriptionHandle) ?? "",
      },
      stats: raw.stats ?? parent?.stats,
      equipmentId: raw.equipmentId ?? parent?.equipmentId,
      equipmentLootable: raw.equipmentLootable ?? parent?.equipmentLootable,
      icon: raw.icon || parent?.icon || undefined,
      type: raw.type || parent?.type || undefined,
      subLevelName: raw.subLevelName || parent?.subLevelName || undefined,
      isTrap: raw.isTrap ?? parent?.isTrap,
      disarmDifficultyClassId: (raw.hasDisarmDifficultyClassId
        ? raw.disarmDifficultyClassId
        : parent?.disarmDifficultyClassId) || undefined,
      provenance: raw.provenance,
    };
    resolvedTemplates.set(id, resolved);
    return resolved;
  };

  for (const id of rawTemplates.keys()) resolveTemplate(id);
  const templates = Object.fromEntries([...resolvedTemplates.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en")));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    sourceBuild: arguments_.get("source-build") ?? undefined,
    stats: {
      files: files.length,
      templates: Object.keys(templates).length,
      localizedTemplates: Object.values(templates).filter((template) => template.displayName.en).length,
    },
    templates,
  }, null, 2)}\n`);
  console.log(`Root templates: ${files.length} files, ${Object.keys(templates).length} resolved templates.`);
};

try {
  main();
} catch (error) {
  console.error("Root template catalog build failed:", error);
  process.exitCode = 1;
}
