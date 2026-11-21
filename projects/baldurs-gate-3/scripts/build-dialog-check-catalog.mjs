import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { positiveFlagAssignments, readDialogSpeakers, readSpeakerGroups, resolveDialogItemTransfers } from "./lib/dialog-item-transfers.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { readDialogSpeakerRoleReviews } from "./lib/dialog-speaker-role-reviews.mjs";

const parseArguments = (values) => {
  const result = new Map();
  const sources = [];
  const approvalSources = [];
  const originSources = [];
  const difficultySources = [];
  const storySources = [];
  const speakerGroupSources = [];
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments; received ${key ?? "<missing>"}.`);
    }
    if (key === "--source") sources.push(value);
    else if (key === "--approval-source") approvalSources.push(value);
    else if (key === "--origin-source") originSources.push(value);
    else if (key === "--difficulty-classes") difficultySources.push(value);
    else if (key === "--story-source") storySources.push(value);
    else if (key === "--speaker-groups") speakerGroupSources.push(value);
    else result.set(key.slice(2), value);
  }
  if (sources.length === 0) throw new Error("At least one --source directory is required.");
  if (difficultySources.length === 0) throw new Error("At least one --difficulty-classes file is required.");
  for (const required of ["localization-en", "output"]) {
    if (!result.has(required)) throw new Error(`Missing required argument: --${required}`);
  }
  if ((approvalSources.length > 0) !== (originSources.length > 0)) {
    throw new Error("Approval extraction requires both --approval-source and --origin-source inputs.");
  }
  if (!result.has("character-option-catalog")) {
    throw new Error("Missing required argument: --character-option-catalog");
  }
  result.set("sources", sources);
  result.set("approvalSources", approvalSources);
  result.set("originSources", originSources);
  result.set("difficultySources", difficultySources);
  result.set("storySources", storySources);
  if (storySources.length && speakerGroupSources.length === 0) throw new Error("Story item transfers require native --speaker-groups inputs.");
  result.set("speakerGroupSources", speakerGroupSources);
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

const readDifficultyClasses = (filePaths) => {
  const entries = new Map();
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const node of xml.matchAll(/<node\s+id="DifficultyClass">([\s\S]*?)<\/node>/g)) {
      const body = node[1];
      const id = body.match(/<attribute\s+id="UUID"[^>]*\svalue="([^"]+)"/)?.[1];
      const value = body.match(/<attribute\s+id="Difficulties"[^>]*\svalue="([^"]+)"/)?.[1];
      const name = body.match(/<attribute\s+id="Name"[^>]*\svalue="([^"]+)"/)?.[1];
      if (id && value && Number.isFinite(Number(value))) entries.set(id.toLocaleLowerCase("en-US"), { value: Number(value), name });
    }
  }
  if (entries.size === 0) throw new Error("No difficulty classes were parsed from the supplied files.");
  return entries;
};

const normalizedId = (value) => value?.toLocaleLowerCase("en-US");

const readOrigins = (filePaths, localization) => {
  const entries = new Map();
  for (const filePath of filePaths) {
    const xml = fs.readFileSync(filePath, "utf8");
    for (const body of xml.split(/<node\s+id="Origin">/).slice(1)) {
      const id = normalizedId(body.match(/<attribute\s+id="UUID"[^>]*\svalue="([^"]+)"/)?.[1]);
      const internalName = body.match(/<attribute\s+id="Name"[^>]*\svalue="([^"]+)"/)?.[1];
      const templateId = normalizedId(body.match(/<attribute\s+id="GlobalTemplate"[^>]*\svalue="([^"]+)"/)?.[1]);
      const defaultsTemplateId = normalizedId(body.match(/<attribute\s+id="DefaultsTemplate"[^>]*\svalue="([^"]+)"/)?.[1]);
      const availableInCharacterCreation = Number(body.match(/<attribute\s+id="AvailableInCharacterCreation"[^>]*\svalue="([^"]+)"/)?.[1]);
      const displayNameHandle = body.match(/<attribute\s+id="DisplayName"[^>]*\shandle="([^"]+)"/)?.[1];
      if (!id || !internalName) continue;
      entries.set(id, {
        id,
        internalName,
        templateId,
        defaultsTemplateId,
        availableInCharacterCreation: Number.isFinite(availableInCharacterCreation)
          ? availableInCharacterCreation
          : undefined,
        filterEligible: Boolean(templateId || defaultsTemplateId),
        displayNameHandle,
        localizedNames: Object.fromEntries(Object.entries({
          en: displayNameHandle ? localization.en.get(displayNameHandle) : undefined,
          tr: displayNameHandle ? localization.tr.get(displayNameHandle) : undefined,
        }).filter(([, value]) => value)),
        provenance: path.basename(filePath),
      });
    }
  }
  return entries;
};

const readApprovalRatings = (sources, origins) => {
  const ratingsByModule = new Map();
  let fileCount = 0;
  let unresolvedEffectCount = 0;
  for (const source of sources) {
    const module = path.basename(source);
    const moduleRatings = ratingsByModule.get(module) ?? new Map();
    ratingsByModule.set(module, moduleRatings);
    const files = walkFiles(source)
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsx"))
      .sort((left, right) => left.localeCompare(right, "en"));
    fileCount += files.length;
    for (const filePath of files) {
      const xml = fs.readFileSync(filePath, "utf8");
      const id = normalizedId(xml.match(/<attribute\s+id="UUID"[^>]*\svalue="([^"]+)"/)?.[1]);
      if (!id) continue;
      const effects = [];
      const pattern = /<attribute\s+id="id"[^>]*\svalue="([^"]+)"\s*\/>[\s\S]*?<attribute\s+id="value"[^>]*\svalue="(-?\d+)"\s*\/>/g;
      for (const match of xml.matchAll(pattern)) {
        const originId = normalizedId(match[1]);
        const origin = origins.get(originId);
        if (!origin) {
          unresolvedEffectCount += 1;
          continue;
        }
        const value = Number(match[2]);
        if (value === 0) continue;
        effects.push({
          originId,
          originName: origin.internalName,
          originTemplateId: origin.templateId,
          originDefaultsTemplateId: origin.defaultsTemplateId,
          originAvailableInCharacterCreation: origin.availableInCharacterCreation,
          originFilterEligible: origin.filterEligible,
          localizedNames: origin.localizedNames,
          value,
        });
      }
      moduleRatings.set(id, {
        id,
        module,
        scope: Number(xml.match(/<attribute\s+id="Scope"[^>]*\svalue="(\d+)"/)?.[1] ?? 0),
        effects,
        provenance: `${module}/${path.relative(source, filePath).split(path.sep).join("/")}`,
      });
    }
  }
  const resolve = (module, id) => {
    const direct = ratingsByModule.get(module);
    if (direct?.has(id)) return direct.get(id);
    const fallbacks = [...ratingsByModule.entries()]
      .filter(([candidateModule, ratings]) => candidateModule !== module && ratings.has(id))
      .map(([, ratings]) => ratings.get(id));
    return fallbacks.length === 1 ? fallbacks[0] : undefined;
  };
  return { ratingsByModule, resolve, fileCount, unresolvedEffectCount };
};

const collectHandles = (value, output = []) => {
  if (Array.isArray(value)) {
    for (const item of value) collectHandles(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (typeof value.handle === "string" && value.handle) output.push(value.handle);
  for (const nested of Object.values(value)) collectHandles(nested, output);
  return output;
};

const humanizeFileName = (filePath) => path.basename(filePath, path.extname(filePath))
  .replace(/^[A-Z0-9]{2,5}_(?=[A-Z][a-z])/, "")
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim();

const unique = (values) => [...new Set(values.filter(Boolean))];

const consequenceNamePattern = /(?:Hostile|Killed|Kill|Dead|Death|Saved|Save|Freed|Free|Recruit|Leave|Attack|Betray|Quest|Reward|Give|Take|Took|Steal|Stole|Open|Unlock|Reveal|Knows|Romance|Breakup|Deny|Accept|Refuse|Surrender|Escape|Prison|Rescue|Deal|Alliance|Enemy|Peace|Fight|Combat|Sacrifice|Abduct|Kidnap|Destroy|Explod|Curse|Bless|Tadpole|Vampire|Ascend|Duke|Crown|Persuad|Convinc|Agree|Disagree|Help|SideWith|Support|Oppose|Release|Allow|Prevent|Stop|Learn|Discover)/i;
const ignoredConsequenceNamePattern = /(?:ORI_Inclusion|Debug|Node_|DialogNode|Cinematic|Animation|VoiceBark|_AD_|_PAD_|_VB_|HasMet|WasInDialog)/i;
const humanizeConsequenceName = (internalName) => {
  if (internalName === "FactionHostileToPlayerGroupAfterDialog") return "Starts combat: faction becomes hostile";
  if (internalName === "GLO_Companion_Combat") return "Starts combat with companion";
  if (internalName === "GLO_Companion_Leave") return "Companion leaves";
  const semantic = internalName.match(/_(?:Event|State|Quest|Knows|Outcome|Status)_([^]+)$/)?.[1]
    ?? internalName.replace(/^(?:[A-Z0-9]{2,6}_)+/, "");
  return semantic
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toLocaleUpperCase("en-US"));
};
const readStoryFlagNames = (sourcePaths) => {
  const namesById = new Map();
  for (const sourcePath of sourcePaths) {
    const files = fs.statSync(sourcePath).isDirectory() ? walkFiles(sourcePath) : [sourcePath];
    for (const filePath of files.filter((candidate) => candidate.toLocaleLowerCase("en-US").endsWith(".txt"))) {
      const text = fs.readFileSync(filePath, "utf8");
      for (const match of text.matchAll(/([A-Za-z][A-Za-z0-9_]+)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/ig)) {
        const id = normalizedId(match[2]);
        const internalName = match[1];
        if (!consequenceNamePattern.test(internalName) || ignoredConsequenceNamePattern.test(internalName)) continue;
        const current = namesById.get(id) ?? new Set();
        current.add(internalName);
        namesById.set(id, current);
      }
    }
  }
  return new Map([...namesById].map(([id, names]) => {
    const internalName = [...names].sort((left, right) => left.length - right.length || left.localeCompare(right, "en"))[0];
    return [id, { id, internalName, title: humanizeConsequenceName(internalName) }];
  }));
};

const humanizeRewardName = (value) => value
  .replace(/^(?:(?:S|ALCH|CONS?|LOOT|QUEST|UNI|OBJ|TOOL|GRN|MAG)_[A-Z0-9]+_)+/i, "")
  .replace(/^(?:(?:S|ALCH|CONS?|LOOT|QUEST|UNI|OBJ|TOOL|GRN|MAG)_)+/i, "")
  .replace(/_(?:A|B|C|D|\d{3})$/i, "")
  .replaceAll("_", " ")
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/\s+/g, " ")
  .trim();

const readStoryRewards = (sourcePaths) => {
  const rewardsByFlagId = new Map();
  const uniqueRewards = new Set();
  for (const sourcePath of sourcePaths) {
    const files = (fs.statSync(sourcePath).isDirectory() ? walkFiles(sourcePath) : [sourcePath])
      .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".txt"))
      .filter((filePath) => !/SavegamePatches/i.test(filePath));
    for (const filePath of files) {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      const kbIndex = lines.findIndex((line) => /\bKBSECTION\b/i.test(line));
      const endIndex = kbIndex >= 0 ? kbIndex : lines.length;
      for (let index = 0; index < endIndex; index += 1) {
        const sourceLine = index + 1;
        let statement = lines[index].split("//")[0].trim();
        if (!/^DB_(?:GiveNewItemFromTemplateEvent|GiveTemplateFrom(?:NpcToPlayer|Player)DialogEvent|GiveItemToEvent(?:WithClear)?)\s*\(/i.test(statement)) continue;
        let balance = [...statement].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
        while (balance > 0 && index + 1 < endIndex) {
          index += 1;
          const next = lines[index].split("//")[0].trim();
          statement += ` ${next}`;
          balance += [...next].reduce((value, character) => value + (character === "(" ? 1 : character === ")" ? -1 : 0), 0);
        }
        const predicate = statement.match(/^DB_([A-Za-z0-9_]+)/)?.[1];
        const ids = [...statement.matchAll(/(?:\([A-Z]+\))?([A-Za-z][A-Za-z0-9_]*)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/ig)];
        if (!predicate || ids.length < 2) continue;
        const itemInternalName = ids[0][1];
        const itemId = normalizedId(ids[0][2]);
        const flagInternalName = ids[1][1];
        const flagId = normalizedId(ids[1][2]);
        const trailingAmount = Number(statement.match(/,\s*(\d+)\s*\)\s*;?$/)?.[1] ?? 1);
        const templateReward = predicate === "GiveNewItemFromTemplateEvent"
          || predicate === "GiveTemplateFromNpcToPlayerDialogEvent"
          || predicate === "GiveTemplateFromPlayerDialogEvent";
        const reward = {
          id: `${predicate}:${itemId}:${flagId}:${trailingAmount}`,
          predicate: `DB_${predicate}`,
          kind: templateReward ? "template" : "placed-item",
          itemId,
          itemInternalName,
          title: humanizeRewardName(itemInternalName),
          flagId,
          flagInternalName,
          amount: Number.isInteger(trailingAmount) && trailingAmount > 0 ? trailingAmount : 1,
          evidence: {
            sourcePath: path.relative(process.cwd(), filePath).split(path.sep).join("/"),
            sourceLine,
            statement,
          },
        };
        if (uniqueRewards.has(reward.id)) continue;
        uniqueRewards.add(reward.id);
        const rewards = rewardsByFlagId.get(flagId) ?? [];
        rewards.push(reward);
        rewardsByFlagId.set(flagId, rewards);
      }
    }
  }
  return { rewardsByFlagId, count: uniqueRewards.size };
};

const readCharacterOptions = (filePath) => {
  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const options = new Map(Object.entries(catalog.options ?? {}).map(([id, option]) => [normalizedId(id), option]));
  if (options.size === 0) throw new Error("The character option catalog contains no filterable tags.");
  return { catalog, options };
};

const readPositiveCharacterOptionTags = (node, options) => {
  const matches = new Map();
  for (const group of (node.checkflags ?? []).flatMap((container) => container.flaggroup ?? [])) {
    if (attributeValue(group.type) !== "Tag") continue;
    for (const flag of group.flag ?? []) {
      if (attributeValue(flag.value) !== true) continue;
      const id = normalizedId(attributeValue(flag.UUID));
      const option = options.get(id);
      if (!option) continue;
      matches.set(id, option);
    }
  }
  return [...matches.values()];
};

const main = () => {
  const arguments_ = parseArguments(process.argv.slice(2));
  const sources = arguments_.get("sources").map((source) => path.resolve(source));
  const difficultyClasses = readDifficultyClasses(arguments_.get("difficultySources").map((source) => path.resolve(source)));
  const localization = {
    en: readLocalization(path.resolve(arguments_.get("localization-en"))),
    tr: arguments_.has("localization-tr")
      ? readLocalization(path.resolve(arguments_.get("localization-tr")))
      : new Map(),
  };
  const originSources = arguments_.get("originSources").map((source) => path.resolve(source));
  const approvalSources = arguments_.get("approvalSources").map((source) => path.resolve(source));
  const origins = readOrigins(originSources, localization);
  const approvalCatalog = readApprovalRatings(approvalSources, origins);
  const characterOptions = readCharacterOptions(path.resolve(arguments_.get("character-option-catalog")));
  const resolvedStorySources = arguments_.get("storySources").map((source) => path.resolve(source));
  const storyFlagNames = readStoryFlagNames(resolvedStorySources);
  const storyRewards = readStoryRewards(resolvedStorySources);
  // A native item-transfer registration is meaningful even when its flag name
  // says "handover" or "transfer" instead of matching the naming heuristic.
  // Keep explicit developer flags excluded; do not infer rewards from names.
  for (const [id, relations] of storyRewards.rewardsByFlagId) {
    const relation = relations.find(({ flagInternalName }) => !/debug/i.test(flagInternalName));
    if (relation && !storyFlagNames.has(id)) {
      const internalName = relation.flagInternalName;
      storyFlagNames.set(id, { id, internalName, title: humanizeConsequenceName(internalName) });
    }
  }
  const speakerGroups = arguments_.get("speakerGroupSources").length
    ? readSpeakerGroups(arguments_.get("speakerGroupSources").map((source) => path.resolve(source))) : new Map();
  const speakerRoleReviews = arguments_.has("speaker-role-reviews")
    ? readDialogSpeakerRoleReviews(path.resolve(arguments_.get("speaker-role-reviews")), process.cwd()) : undefined;
  const outputPath = path.resolve(arguments_.get("output"));
  const sourceBuild = arguments_.get("source-build") ?? undefined;
  if (speakerRoleReviews && speakerRoleReviews.catalog.sourceBuild !== sourceBuild) {
    throw new Error("Speaker-role reviews belong to a different source build");
  }
  const usedRoleReviewIds = new Set();
  const files = sources.flatMap((source) => walkFiles(source)
    .filter((filePath) => filePath.toLocaleLowerCase("en-US").endsWith(".lsj"))
    .map((filePath) => ({
      source,
      filePath,
      module: path.basename(source),
    })))
    .sort((left, right) => left.filePath.localeCompare(right.filePath, "en"));

  const dialogs = {};
  const dialogCandidates = new Map();
  const resourceBindings = arguments_.has("resource-bindings")
    ? JSON.parse(fs.readFileSync(path.resolve(arguments_.get("resource-bindings")), "utf8")) : undefined;
  const selectDuplicate = (id, candidates) => {
    if (!resourceBindings) throw new Error(`Duplicate dialog ${id} requires --resource-bindings`);
    const bindings = Object.values(resourceBindings.bindings).filter((entry) => entry.dialogId === id);
    const boundPaths = unique(bindings.map((entry) => path.resolve(entry.dialogSource)));
    const selected = candidates.filter((candidate) => candidate.filePath === boundPaths[0]);
    if (boundPaths.length !== 1 || selected.length !== 1) {
      throw new Error(`Duplicate dialog ${id} has no unique native source binding: ${candidates.map(({ filePath }) => filePath).join(", ")}`);
    }
    for (const binding of bindings) {
      if (binding.nativeDialogPath !== `Mods/${selected[0].entry.module}/Story/Dialogs/${selected[0].entry.provenance}`) {
        throw new Error(`Bound dialog path does not match the input: ${id}`);
      }
      for (const file of [binding.dialogSource, ...binding.declarations.map((entry) => entry.bankSource)]) {
        const hash = createHash("sha256").update(fs.readFileSync(path.resolve(file))).digest("hex");
        if (resourceBindings.hashes[file] !== hash) throw new Error(`Changed dialog binding source: ${file}`);
      }
      const native = JSON.parse(fs.readFileSync(path.resolve(binding.dialogSource), "utf8")).save.regions.dialog;
      if (attributeValue(native.UUID) !== id) throw new Error(`Changed bound dialog identity: ${id}`);
      for (const declaration of binding.declarations) {
        const bank = JSON.parse(fs.readFileSync(path.resolve(declaration.bankSource), "utf8")).save.regions.DialogBank;
        const resource = bank.Resource[declaration.resourceIndex];
        if (attributeValue(resource.ID) !== binding.resourceId
          || attributeValue(resource.SourceFile).replaceAll("\\", "/") !== binding.nativeDialogPath) {
          throw new Error(`Changed native dialog resource: ${binding.resourceId}`);
        }
      }
    }
    return selected[0];
  };
  const byParticipant = {};
  let checkCount = 0;
  let localizedChoiceCount = 0;
  let approvalEventCount = 0;
  let localizedApprovalEventCount = 0;
  let characterChoiceCount = 0;
  let localizedCharacterChoiceCount = 0;
  let choiceOutcomeCount = 0;
  let localizedChoiceOutcomeCount = 0;
  const usedCharacterOptionIds = new Set();
  const approvalOriginIds = new Set();
  const usedApprovalRatingIds = new Set();
  for (const { source, filePath, module } of files) {
    const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const dialog = document?.save?.regions?.dialog;
    if (!dialog) continue;
    const nodes = (dialog.nodes ?? []).flatMap((container) => container.node ?? []);
    const speakers = readDialogSpeakers(dialog);
    const reviewedRoles = speakerRoleReviews?.byFile.get(filePath);
    for (const review of reviewedRoles?.values() ?? []) {
      if (review.dialogId !== attributeValue(dialog.UUID)) throw new Error(`Reviewed dialog identity changed: ${filePath}`);
      usedRoleReviewIds.add(review.id);
    }
    const nodesById = new Map(nodes
      .map((node) => [attributeValue(node.UUID), node])
      .filter(([id]) => id));
    const childIds = (node) => unique((node.children ?? [])
      .flatMap((container) => container.child ?? [])
      .map((child) => attributeValue(child.UUID)));
    const meaningfulFlagsOnNode = (node) => positiveFlagAssignments(node)
      .filter((assignment) => storyFlagNames.has(assignment.flagId));
    const immediateChoiceConsequences = (choiceNode) => {
      const consequences = new Map();
      const addAssignments = (node) => {
        for (const assignment of meaningfulFlagsOnNode(node)) {
          const entries = consequences.get(assignment.flagId) ?? [];
          entries.push(assignment);
          consequences.set(assignment.flagId, entries);
        }
      };
      addAssignments(choiceNode);
      const queue = childIds(choiceNode);
      const visited = new Set();
      while (queue.length > 0) {
        const nodeId = queue.shift();
        if (!nodeId || visited.has(nodeId)) continue;
        visited.add(nodeId);
        const node = nodesById.get(nodeId);
        if (!node || attributeValue(node.constructor) === "TagQuestion") continue;
        addAssignments(node);
        queue.push(...childIds(node));
      }
      return [...consequences].map(([flagId, assignments]) => ({
        ...storyFlagNames.get(flagId),
        ...resolveDialogItemTransfers(storyRewards.rewardsByFlagId.get(flagId) ?? [], assignments, speakers, speakerGroups, reviewedRoles),
      }));
    };
    const checks = nodes
      .filter((node) => attributeValue(node.RollType))
      .map((node) => {
        const difficultyId = attributeValue(node.DifficultyClassID, "").toLocaleLowerCase("en-US");
        const difficulty = difficultyClasses.get(difficultyId);
        const handles = unique(collectHandles(node.TaggedTexts));
        const textHandle = handles[0];
        const localizedText = {
          en: textHandle ? localization.en.get(textHandle) : undefined,
          tr: textHandle ? localization.tr.get(textHandle) : undefined,
        };
        return {
          id: attributeValue(node.UUID),
          rollType: attributeValue(node.RollType),
          skill: attributeValue(node.Skill),
          ability: attributeValue(node.Ability),
          difficultyClassId: difficultyId || undefined,
          difficultyClass: difficulty?.value,
          difficultyName: difficulty?.name,
          textHandle,
          localizedText: Object.fromEntries(Object.entries(localizedText).filter(([, value]) => value)),
        };
      })
      .filter((check) => check.id && check.rollType && (check.difficultyClass !== undefined || check.textHandle));
    const approvals = nodes
      .filter((node) => attributeValue(node.ApprovalRatingID))
      .map((node) => {
        const approvalRatingId = normalizedId(attributeValue(node.ApprovalRatingID));
        const rating = approvalCatalog.resolve(module, approvalRatingId);
        if (!rating || rating.effects.length === 0) return null;
        const handles = unique(collectHandles(node.TaggedTexts));
        const textHandle = handles[0];
        const localizedText = {
          en: textHandle ? localization.en.get(textHandle) : undefined,
          tr: textHandle ? localization.tr.get(textHandle) : undefined,
        };
        return {
          id: attributeValue(node.UUID),
          approvalRatingId,
          nodeType: attributeValue(node.constructor),
          speakerIndex: Number(attributeValue(node.speaker, -1)),
          textHandle,
          localizedText: Object.fromEntries(Object.entries(localizedText).filter(([, value]) => value)),
          effects: rating.effects,
          reactionScope: rating.scope,
          reactionProvenance: rating.provenance,
        };
      })
      .filter((approval) => approval?.id && approval.effects.length > 0);
    const characterChoices = nodes
      .map((node) => {
        const facets = readPositiveCharacterOptionTags(node, characterOptions.options);
        if (facets.length === 0) return null;
        const handles = unique(collectHandles(node.TaggedTexts));
        const textHandle = handles.find((handle) => localization.en.has(handle)) ?? handles[0];
        const localizedText = {
          en: textHandle ? localization.en.get(textHandle) : undefined,
          tr: textHandle ? localization.tr.get(textHandle) : undefined,
        };
        return {
          id: attributeValue(node.UUID),
          nodeType: attributeValue(node.constructor),
          speakerIndex: Number(attributeValue(node.speaker, -1)),
          textHandle,
          localizedText: Object.fromEntries(Object.entries(localizedText).filter(([, value]) => value)),
          facets: facets.map((facet) => ({
            id: facet.id,
            kind: facet.kind,
            internalName: facet.internalName,
            definitionId: facet.definitionId,
            parentDefinitionId: facet.parentDefinitionId,
            localizedNames: facet.localizedNames,
          })),
          conditionSource: "node.checkflags",
        };
      })
      .filter((choice) => choice?.id && choice.facets.length > 0);
    const choiceOutcomes = nodes
      .filter((node) => attributeValue(node.constructor) === "TagQuestion")
      .map((node) => {
        const consequences = immediateChoiceConsequences(node);
        if (consequences.length === 0) return null;
        const handles = unique(collectHandles(node.TaggedTexts));
        const textHandle = handles.find((handle) => localization.en.has(handle)) ?? handles[0];
        const localizedText = {
          en: textHandle ? localization.en.get(textHandle) : undefined,
          tr: textHandle ? localization.tr.get(textHandle) : undefined,
        };
        if (!localizedText.en) return null;
        return {
          id: attributeValue(node.UUID),
          nodeType: attributeValue(node.constructor),
          speakerIndex: Number(attributeValue(node.speaker, -1)),
          textHandle,
          localizedText: Object.fromEntries(Object.entries(localizedText).filter(([, value]) => value)),
          consequenceScope: "choice-path-before-next-question",
          consequences,
        };
      })
      .filter((choice) => choice?.id && choice.consequences.length > 0);
    if (checks.length === 0 && approvals.length === 0 && characterChoices.length === 0 && choiceOutcomes.length === 0) continue;

    const participants = unique(speakers.flatMap((speaker) => speaker.participantIds));
    if (participants.length === 0) continue;
    const id = attributeValue(dialog.UUID) ?? path.relative(source, filePath).split(path.sep).join("/");
    const relativePath = path.relative(source, filePath).split(path.sep).join("/");
    const entry = {
      id,
      title: humanizeFileName(filePath),
      category: attributeValue(dialog.category),
      module,
      participants,
      checks,
      approvals,
      characterChoices,
      choiceOutcomes,
      triggerHint: attributeValue(document?.save?.regions?.editorData?.HowToTrigger),
      provenance: relativePath,
    };
    const candidates = dialogCandidates.get(id) ?? [];
    candidates.push({ filePath, entry });
    dialogCandidates.set(id, candidates);
  }

  for (const [id, candidates] of dialogCandidates) {
    dialogs[id] = (candidates.length === 1 ? candidates[0] : selectDuplicate(id, candidates)).entry;
  }
  // Index and count the resolved records, never overwritten files or rejected nodes.
  for (const { id, participants, checks, approvals, characterChoices, choiceOutcomes } of Object.values(dialogs)) {
    checkCount += checks.length;
    localizedChoiceCount += checks.filter((entry) => entry.localizedText.en).length;
    approvalEventCount += approvals.length;
    localizedApprovalEventCount += approvals.filter((entry) => entry.localizedText.en).length;
    characterChoiceCount += characterChoices.length;
    localizedCharacterChoiceCount += characterChoices.filter((entry) => entry.localizedText.en).length;
    choiceOutcomeCount += choiceOutcomes.length;
    localizedChoiceOutcomeCount += choiceOutcomes.filter((entry) => entry.localizedText.en).length;
    for (const approval of approvals) {
      usedApprovalRatingIds.add(`${approval.reactionProvenance.split("/")[0]}:${approval.approvalRatingId}`);
      for (const effect of approval.effects) approvalOriginIds.add(effect.originId);
    }
    for (const choice of characterChoices) for (const facet of choice.facets) usedCharacterOptionIds.add(facet.id);
    for (const participant of participants) (byParticipant[participant] ??= []).push(id);
  }

  for (const ids of Object.values(byParticipant)) ids.sort((left, right) => left.localeCompare(right, "en"));
  for (const review of speakerRoleReviews?.catalog.entries ?? []) {
    if (!usedRoleReviewIds.has(review.id)) throw new Error(`Reviewed dialog missing from build inputs: ${review.id}`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writeGeneratedFile(outputPath, `${JSON.stringify({
    schemaVersion: 5,
    sourceBuild,
    speakerGroups: Object.fromEntries(speakerGroups),
    ...(speakerRoleReviews ? { speakerRoleReviews: speakerRoleReviews.catalog } : {}),
    stats: {
      files: files.length,
      dialogs: Object.keys(dialogs).length,
      checks: checkCount,
      localizedChoices: localizedChoiceCount,
      approvalFiles: approvalCatalog.fileCount,
      approvalRatings: usedApprovalRatingIds.size,
      approvalEvents: approvalEventCount,
      localizedApprovalEvents: localizedApprovalEventCount,
      characterChoices: characterChoiceCount,
      localizedCharacterChoices: localizedCharacterChoiceCount,
      choiceOutcomes: choiceOutcomeCount,
      localizedChoiceOutcomes: localizedChoiceOutcomeCount,
      consequenceFlags: storyFlagNames.size,
      rewardRelations: storyRewards.count,
      characterOptionTags: usedCharacterOptionIds.size,
      classOptionTags: [...usedCharacterOptionIds]
        .filter((id) => characterOptions.options.get(id)?.kind === "class").length,
      raceOptionTags: [...usedCharacterOptionIds]
        .filter((id) => characterOptions.options.get(id)?.kind === "race").length,
      approvalOrigins: approvalOriginIds.size,
      filterableApprovalOrigins: [...approvalOriginIds]
        .filter((originId) => origins.get(originId)?.filterEligible).length,
      unresolvedApprovalEffects: approvalCatalog.unresolvedEffectCount,
      participants: Object.keys(byParticipant).length,
    },
    dialogs,
    byParticipant,
  }, null, 2)}\n`);
  console.log(`Dialogue intelligence: ${files.length} files scanned; ${Object.keys(dialogs).length} dialogs, ${checkCount} checks, ${approvalEventCount} approval events, ${characterChoiceCount} character-gated choices, ${choiceOutcomeCount} consequential choices, ${Object.keys(byParticipant).length} participants.`);
};

try {
  main();
} catch (error) {
  console.error("Dialog check catalog build failed:", error);
  process.exitCode = 1;
}
