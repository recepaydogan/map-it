import fs from "node:fs";
import path from "node:path";

const normalizedId = (value) => value?.toLocaleLowerCase("en-US");

const parseArguments = (values) => {
  const result = new Map();
  const storySources = [];
  const dialogSources = [];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    if (key === "--story-source") storySources.push(value);
    else if (key === "--dialog-source") dialogSources.push(value);
    else result.set(key.slice(2), value);
  }
  if (storySources.length === 0) throw new Error("At least one --story-source directory is required.");
  if (dialogSources.length === 0) throw new Error("At least one --dialog-source directory is required.");
  for (const required of ["localization-en", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  result.set("storySources", storySources);
  result.set("dialogSources", dialogSources);
  return result;
};

const walkFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
});

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
  if (!filePath) return new Map();
  const xml = fs.readFileSync(filePath, "utf8");
  const entries = new Map();
  const pattern = /<content\s+contentuid="([^"]+)"[^>]*>([\s\S]*?)<\/content>/g;
  for (const match of xml.matchAll(pattern)) entries.set(match[1], stripLocalizationMarkup(match[2]));
  return entries;
};

const attributeValue = (value, fallback = undefined) => {
  if (!value || Array.isArray(value) || typeof value !== "object") return fallback;
  return value.value ?? value.handle ?? fallback;
};

const collectHandles = (value, output = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectHandles(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (typeof value.handle === "string" && value.handle) output.push(value.handle);
  for (const child of Object.values(value)) collectHandles(child, output);
  return output;
};

const humanizeResourceName = (value) => value
  .replace(/^[A-Z0-9]{2,5}_/, "")
  .replace(/_(?:SpeakWithDead|SwD|Dead)$/i, "")
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim();

const ignoredQuestionPattern = /^(?:\[?leave\.?\]?|leave\.\.\.|goodbye\.?|farewell\.?|go away\.?|end conversation\.?)$/i;
const readQuestions = (filePath, localization) => {
  const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const dialog = document?.save?.regions?.dialog;
  const nodes = (dialog?.nodes ?? []).flatMap((container) => container.node ?? []);
  const questions = [];
  const seen = new Set();
  for (const node of nodes.filter((candidate) => attributeValue(candidate.constructor) === "TagQuestion")) {
    const handles = [...new Set(collectHandles(node.TaggedTexts))];
    const textHandle = handles.find((handle) => localization.en.has(handle)) ?? handles[0];
    const localizedText = Object.fromEntries(Object.entries({
      en: textHandle ? localization.en.get(textHandle) : undefined,
      tr: textHandle ? localization.tr.get(textHandle) : undefined,
    }).filter(([, value]) => value));
    if (!localizedText.en || ignoredQuestionPattern.test(localizedText.en)) continue;
    const key = localizedText.en.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      id: attributeValue(node.UUID),
      localizedText,
    });
  }
  return questions.filter(({ id }) => id);
};

const parseCorpseRelations = (storySources) => {
  const relations = new Map();
  let storyFileCount = 0;
  const guid = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
  const symbol = "([A-Za-z][A-Za-z0-9_]*)";
  const characterCallPattern = new RegExp(`^DB_GLO_CharacterCorpseDialog\\(\\s*(?:\\(CHARACTER\\))?${symbol}_${guid}\\s*,\\s*(?:\\(DIALOGRESOURCE\\))?${symbol}_${guid}\\s*\\)\\s*;?`, "i");
  const customEntityCallPattern = new RegExp(`^DB_GLO_CustomEntityCorpseDialog\\(\\s*(?:\\([A-Z]+\\))?${symbol}_${guid}\\s*,\\s*(?:\\(CHARACTER\\))?${symbol}_${guid}\\s*,\\s*(?:\\(DIALOGRESOURCE\\))?${symbol}_${guid}\\s*\\)\\s*;?`, "i");
  for (const source of storySources) {
    const module = path.basename(source);
    const files = walkFiles(source)
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".txt"))
      .filter((filePath) => !/SavegamePatches/i.test(filePath));
    storyFileCount += files.length;
    for (const filePath of files) {
      const text = fs.readFileSync(filePath, "utf8");
      const lines = text.split(/\r?\n/);
      const initIndex = lines.findIndex((line) => /\bINITSECTION\b/i.test(line));
      const kbIndex = lines.findIndex((line) => /\bKBSECTION\b/i.test(line));
      let inActionBlock = false;
      for (let index = initIndex >= 0 ? initIndex + 1 : 0; index < lines.length; index += 1) {
        const line = lines[index].split("//")[0].trim();
        if (/^KBSECTION$/i.test(line)) {
          inActionBlock = false;
          continue;
        }
        if (/^(?:IF|PROC|QRY|EVENT)$/i.test(line)) {
          inActionBlock = false;
          continue;
        }
        if (/^THEN$/i.test(line)) {
          inActionBlock = true;
          continue;
        }
        const inInitSection = kbIndex < 0 || index < kbIndex;
        if ((!inInitSection && !inActionBlock) || !line || /^NOT\s+/i.test(line)) continue;
        const sourceLine = index + 1;
        let statement = line;
        let balance = [...statement].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
        while (balance > 0 && index + 1 < lines.length) {
          index += 1;
          const next = lines[index].split("//")[0].trim();
          statement += ` ${next}`;
          balance += [...next].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
        }
        const characterMatch = statement.match(characterCallPattern);
        const customEntityMatch = statement.match(customEntityCallPattern);
        if (!characterMatch && !customEntityMatch) continue;
        const customEntity = Boolean(customEntityMatch);
        const match = customEntityMatch ?? characterMatch;
        const characterInternalName = match[1];
        const characterId = normalizedId(match[2]);
        const helperCharacter = customEntity ? {
          internalName: match[3],
          id: normalizedId(match[4]),
        } : undefined;
        const dialogInternalName = customEntity ? match[5] : match[3];
        const dialogResourceId = normalizedId(customEntity ? match[6] : match[4]);
        const predicate = customEntity ? "DB_GLO_CustomEntityCorpseDialog" : "DB_GLO_CharacterCorpseDialog";
        const key = `${predicate}:${characterId}:${dialogResourceId}`;
        const evidence = {
          sourcePath: `${module}/${path.relative(source, filePath).split(path.sep).join("/")}`,
          sourceLine,
          statement,
        };
        const existing = relations.get(key);
        if (existing) {
          existing.evidence.push(evidence);
          existing.conditional &&= !inInitSection;
          continue;
        }
        relations.set(key, {
          predicate,
          module,
          characterId,
          characterInternalName,
          ...(helperCharacter ? { helperCharacter } : {}),
          dialogResourceId,
          dialogInternalName,
          conditional: !inInitSection,
          evidence: [evidence],
        });
      }
    }
  }
  return { relations: [...relations.values()], storyFileCount };
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const storySources = arguments_.get("storySources").map((source) => path.resolve(source));
  const dialogSources = arguments_.get("dialogSources").map((source) => path.resolve(source));
  const outputPath = path.resolve(arguments_.get("output"));
  const sourceBuild = arguments_.get("source-build") ?? null;
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: arguments_.has("localization-tr")
      ? readLocalization(path.resolve(arguments_.get("localization-tr")))
      : new Map(),
  };
  const { relations, storyFileCount } = parseCorpseRelations(storySources);

  const dialogFilesByModuleAndName = new Map();
  let dialogFileCount = 0;
  for (const source of dialogSources) {
    const module = path.basename(source);
    const files = walkFiles(source)
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsj"));
    dialogFileCount += files.length;
    for (const filePath of files) {
      const name = path.basename(filePath, path.extname(filePath)).toLocaleLowerCase("en-US");
      const key = `${module.toLocaleLowerCase("en-US")}:${name}`;
      const matches = dialogFilesByModuleAndName.get(key) ?? [];
      matches.push(filePath);
      dialogFilesByModuleAndName.set(key, matches);
    }
  }

  const byCharacterId = {};
  let matchedRelations = 0;
  let ambiguousRelations = 0;
  let localizedQuestions = 0;
  const unmatchedRelations = [];
  const questionCache = new Map();
  for (const relation of relations) {
    const key = `${relation.module.toLocaleLowerCase("en-US")}:${relation.dialogInternalName.toLocaleLowerCase("en-US")}`;
    const dialogMatches = dialogFilesByModuleAndName.get(key) ?? [];
    if (dialogMatches.length !== 1) {
      if (dialogMatches.length > 1) ambiguousRelations += 1;
      unmatchedRelations.push({
        characterId: relation.characterId,
        characterInternalName: relation.characterInternalName,
        dialogResourceId: relation.dialogResourceId,
        dialogInternalName: relation.dialogInternalName,
        module: relation.module,
        reason: dialogMatches.length === 0 ? "no-exact-dialog-basename" : "ambiguous-dialog-basename",
        evidence: relation.evidence,
      });
      continue;
    }
    matchedRelations += 1;
    const filePath = dialogMatches[0];
    let questions = questionCache.get(filePath);
    if (!questions) {
      questions = readQuestions(filePath, localization);
      questionCache.set(filePath, questions);
    }
    localizedQuestions += questions.length;
    const profile = byCharacterId[relation.characterId] ??= {
      characterId: relation.characterId,
      characterInternalName: relation.characterInternalName,
      dialogs: [],
    };
    profile.dialogs.push({
      dialogResourceId: relation.dialogResourceId,
      dialogInternalName: relation.dialogInternalName,
      title: humanizeResourceName(relation.dialogInternalName),
      conditional: relation.conditional,
      predicate: relation.predicate,
      questions,
      provenance: `${relation.module}/${path.relative(dialogSources.find((source) => path.basename(source) === relation.module), filePath).split(path.sep).join("/")}`,
      evidence: relation.evidence,
    });
  }

  for (const profile of Object.values(byCharacterId)) {
    profile.dialogs.sort((left, right) => left.dialogInternalName.localeCompare(right.dialogInternalName, "en"));
    profile.dialogCount = profile.dialogs.length;
    profile.questionCount = new Set(profile.dialogs.flatMap(({ questions }) => questions.map(({ localizedText }) => localizedText.en))).size;
  }

  const catalog = {
    schemaVersion: 1,
    sourceBuild,
    stats: {
      storyFiles: storyFileCount,
      dialogFiles: dialogFileCount,
      relations: relations.length,
      uniqueCharacters: new Set(relations.map(({ characterId }) => characterId)).size,
      conditionalRelations: relations.filter(({ conditional }) => conditional).length,
      customEntityRelations: relations.filter(({ predicate }) => predicate === "DB_GLO_CustomEntityCorpseDialog").length,
      matchedRelations,
      unmatchedRelations: unmatchedRelations.length,
      ambiguousRelations,
      profiledCharacters: Object.keys(byCharacterId).length,
      localizedQuestions,
    },
    byCharacterId,
    unmatchedRelations,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(`Corpse dialogues: ${matchedRelations}/${relations.length} exact dialog files matched; ${Object.keys(byCharacterId).length} characters and ${localizedQuestions} localized questions.`);
};

try {
  main();
} catch (error) {
  console.error("Corpse dialog catalog build failed:", error);
  process.exitCode = 1;
}
