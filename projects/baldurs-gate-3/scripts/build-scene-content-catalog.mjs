import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReviewedStoryRuleReader, normalizeStoryStatement as normalized } from "./lib/reviewed-story-rules.mjs";
import { splitArguments, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { readStorySceneRecipe } from "./lib/story-scene-recipe.mjs";
import { readReviewedCampResidentProfiles } from "./lib/reviewed-camp-resident-profiles.mjs";
import { readReviewedSceneDisplayName } from "./lib/reviewed-scene-display-name.mjs";
import { storyStatementSpan } from "./lib/story-source-lines.mjs";
import { createLogicalReviewedStoryRuleReader } from "./lib/logical-reviewed-story-rules.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index].startsWith("--") || process.argv[index + 1] === undefined) throw new Error("Expected --name value arguments");
  args.set(process.argv[index].slice(2), process.argv[index + 1]);
}
for (const key of ["recipe", "destinations", "output"]) if (!args.has(key)) throw new Error(`Missing --${key}`);
const hashes = {};
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const text = (file) => {
  const absolute = path.resolve(root, file), bytes = fs.readFileSync(absolute), key = relative(absolute);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hashes[key] && hashes[key] !== hash) throw new Error(`Scene source changed: ${key}`);
  hashes[key] = hash;
  return bytes.toString("utf8");
};
const recipe = readStorySceneRecipe(args.get("recipe"), text, root);
const base = args.has("base-catalog") ? readVerifiedSceneContentCatalog(path.resolve(root, args.get("base-catalog")), root) : null;
if (base) {
  text(args.get("base-catalog"));
  for (const file of Object.keys(base.hashes)) text(file);
}
const items = args.has("items") ? JSON.parse(text(args.get("items"))).items : [];
const destinations = JSON.parse(text(args.get("destinations"))).scriptedDestinations;
const members = JSON.parse(text(args.get("party-members") ?? "map-sources/catalog/party-members.json")).members;
const { source, context, verify } = (recipe.logicalStatements ? createLogicalReviewedStoryRuleReader : createReviewedStoryRuleReader)(text);
const reviews = new Map();
for (const review of recipe.reviews) {
  if (reviews.has(review.id)) throw new Error(`Duplicate scene review: ${review.id}`);
  reviews.set(review.id, verify(review));
}
const nativeRow = (file, row) => {
  const lines = source(file).lines;
  let index = row.sourceLine - 1, joined = lines[index]?.trim() ?? "";
  let span = storyStatementSpan(joined);
  while ((span.depth > 0 || span.quoted) && index + 1 < lines.length) {
    joined += ` ${lines[++index].trim()}`;
    span = storyStatementSpan(joined);
  }
  if (span.depth !== 0 || span.quoted || span.closingIndex < 0 || !["", ";"].includes(joined.slice(span.closingIndex + 1).trim())) {
    throw new Error(`Incomplete or ambiguous scene table row: ${file}:${row.sourceLine}`);
  }
  const statement = normalized(joined.slice(0, span.closingIndex + 1));
  if (statement !== normalized(row.statement)) throw new Error(`Changed scene table row: ${file}:${row.sourceLine}`);
  return { sourcePath: file, sourceLine: row.sourceLine, statement };
};
const sceneInventory = (profile) => {
  const replacement = profile.inventoryChange;
  if (!replacement) return undefined;
  if (!replacement.localizedConditions?.en || !replacement.branches?.length) throw new Error(`Missing replacement conditions: ${profile.id}`);
  const transfer = reviews.get(replacement.transferReview);
  const action = transfer?.actions.find((statement) => /^MoveAllItemsTo\(/.test(statement));
  if (!profile.reviews.includes(replacement.transferReview) || !action
    || parseEndpoint(splitArguments(action)[1])?.id !== replacement.destinationContentId) throw new Error(`Unproven inventory transfer: ${profile.id}`);
  const parameters = splitArguments(action).slice(2);
  if (parameters.length !== 4 || parameters.some((value) => !["0", "1"].includes(value))) throw new Error(`Unreviewed inventory transfer signature: ${profile.id}`);
  const transferOptions = Object.fromEntries(["moveEquippedArmor", "moveEquippedWeapons", "clearOriginalOwner", "moveVanityClothing"]
    .map((key, index) => [key, parameters[index] === "1"]));
  const branches = replacement.branches.map((branch) => {
    if (!branch.localizedConditions?.en || !branch.rows?.length) throw new Error(`Incomplete inventory branch: ${branch.id}`);
    const flags = new Map();
    const branchItems = branch.rows.map((row) => {
      const evidence = nativeRow(replacement.sourcePath, row);
      const arguments_ = splitArguments(evidence.statement);
      const actor = arguments_[0].replace(/^\([A-Z]+\)/, "");
      if (parseEndpoint(arguments_[0])?.id !== profile.characterContentId && actor !== "_Char") throw new Error(`Wrong inventory recipient: ${branch.id}`);
      if (actor === "_Char" && !profile.reviews.some((id) => reviews.get(id).evidence.some((entry) => entry.sourcePath === evidence.sourcePath && entry.sourceLine === evidence.sourceLine))) {
        throw new Error(`Unbound inventory helper: ${branch.id}`);
      }
      if (arguments_.length === 4) {
        const flagId = parseEndpoint(arguments_[1])?.id;
        if (!["0", "1"].includes(arguments_[2])) throw new Error(`Non-boolean scene condition: ${branch.id}`);
        if (flagId) {
          const value = Number(arguments_[2]);
          if (flags.has(flagId) && flags.get(flagId) !== value) throw new Error(`Conflicting branch flags: ${branch.id}`);
          flags.set(flagId, value);
        }
      } else if (arguments_.length !== 2) throw new Error(`Unreviewed scene item table shape: ${branch.id}`);
      const templateId = parseEndpoint(arguments_.at(-1))?.id;
      const item = items.find(({ id, templateIds, generation }) => id === templateId && templateIds.includes(templateId) && !generation);
      if (!item) throw new Error(`No exact template-default scene item: ${templateId}`);
      return { itemId: item.id, templateId, statsId: item.statsId, title: item.name, localizedNames: item.localizedNames, amount: 1, evidence: [evidence] };
    });
    if (new Set(branchItems.map(({ itemId }) => itemId)).size !== branchItems.length) throw new Error(`Duplicate branch item: ${branch.id}`);
    return { id: branch.id, localizedConditions: branch.localizedConditions, items: branchItems,
      requiredGlobalFlags: [...flags].map(([flagId, value]) => ({ flagId, value })),
      ...(branch.reviewOnly ? { reviewOnly: true } : {}) };
  });
  if (new Set(branches.map(({ id }) => id)).size !== branches.length) throw new Error(`Duplicate inventory branch: ${profile.id}`);
  return { mode: "transfer-and-equip", destinationContentId: replacement.destinationContentId,
    transferOptions, preservesStoryItems: true,
    contractSource: "https://docs.baldursgate3.game/index.php?title=MoveAllItemsTo",
    localizedConditions: replacement.localizedConditions, branches, evidence: transfer.evidence };
};
const profiles = recipe.profiles.map((profile) => {
  if (!profile.localizedDescriptions?.en || !profile.lootAvailability?.en || !profile.reviews?.length) throw new Error(`Missing scene review/conditions: ${profile.id}`);
  const relation = destinations.find(({ character, anchor, evidence }) => character.id === profile.characterContentId
    && anchor.id === profile.anchorContentId && evidence.some(({ sourcePath, sourceLine }) => sourcePath === profile.destinationSource && sourceLine === profile.destinationLine));
  if (!relation) throw new Error(`Scene lacks normal destination evidence: ${profile.id}`);
  const placed = context(profile.destinationSource, profile.destinationLine);
  let arguments_ = splitArguments(placed.statement);
  const bindingEvidence = [];
  if (profile.destinationBinding) {
    const binding = profile.destinationBinding;
    const row = nativeRow(profile.destinationSource, binding);
    const rowArgs = splitArguments(row.statement);
    const guard = placed.guards.find((value) => value.startsWith(`${row.statement.slice(0, row.statement.indexOf("("))}(`));
    if (!guard) throw new Error(`Missing destination table guard: ${profile.id}`);
    const guardArgs = splitArguments(guard);
    if (guardArgs.length !== rowArgs.length) throw new Error(`Wrong destination table arity: ${profile.id}`);
    const variables = new Map();
    for (let index = 0; index < guardArgs.length; index++) {
      const token = guardArgs[index].replace(/^\([A-Z]+\)/, "");
      if (token === "_") continue;
      if (/^_[A-Za-z]/.test(token)) {
        if (variables.has(token) && variables.get(token) !== rowArgs[index]) throw new Error(`Conflicting destination binding: ${profile.id}`);
        variables.set(token, rowArgs[index]);
      } else if ((parseEndpoint(token)?.id ?? token) !== (parseEndpoint(rowArgs[index])?.id ?? rowArgs[index])) throw new Error(`Destination literal mismatch: ${profile.id}`);
    }
    arguments_ = arguments_.map((value) => variables.get(value.replace(/^\([A-Z]+\)/, "")) ?? value);
    if (!relation.evidence.some((entry) => entry.sourcePath === row.sourcePath && entry.sourceLine === row.sourceLine)) throw new Error(`Destination lacks table evidence: ${profile.id}`);
    bindingEvidence.push(row);
  }
  if (!/^(?:TeleportTo|PROC_CharacterMoveTo)\(/.test(placed.statement)
    || parseEndpoint(arguments_[0])?.id !== profile.characterContentId || parseEndpoint(arguments_[1])?.id !== profile.anchorContentId) {
    throw new Error(`Scene actor/anchor does not match native movement: ${profile.id}`);
  }
  if (profile.kind === "party-member" && !members.some(({ characterId }) => characterId === profile.characterContentId)) {
    throw new Error(`Scene companion has no native party profile: ${profile.id}`);
  }
  const inventory = sceneInventory(profile);
  const localizedTitles = readReviewedSceneDisplayName(profile, reviews, text);
  if (profile.deathDropsUnavailable) {
    if (profile.deathDropsUnavailable !== true || !profile.immortalityReviews?.length
      || !profile.immortalityReviews.every((id) => profile.reviews.includes(id) && reviews.get(id)?.actions.some((action) => {
        if (!action.startsWith("SetImmortal(")) return false;
        const args = splitArguments(action);
        return args.length === 2 && parseEndpoint(args[0])?.id === profile.characterContentId && args[1] === "1";
      }))) throw new Error(`Unproven unavailable death acquisition: ${profile.id}`);
  }
  const descriptions = inventory ? Object.fromEntries(Object.entries(profile.localizedDescriptions).map(([language, description]) => [language,
    [description, ...inventory.branches.filter((branch) => !branch.reviewOnly).map((branch) => `${branch.localizedConditions[language] ?? branch.localizedConditions.en} ${branch.items.map((item) => item.localizedNames[language] ?? item.title).join(", ")}.`)].join(" "),
  ])) : profile.localizedDescriptions;
  const evidence = [...bindingEvidence, ...placed.evidence, ...profile.reviews.flatMap((id) => {
    if (!reviews.has(id)) throw new Error(`Missing scene review ${id}`);
    return reviews.get(id).evidence;
  })];
  return { id: profile.id, characterContentId: profile.characterContentId, anchorContentId: profile.anchorContentId,
    kind: profile.kind, omitAuthoredCombat: profile.omitAuthoredCombat,
    ...(profile.deathDropsUnavailable ? { deathDropsUnavailable: true } : {}),
    localizedDescriptions: descriptions, lootAvailability: profile.lootAvailability,
    ...(localizedTitles ? { localizedTitles } : {}),
    ...(inventory ? { inventoryChange: inventory } : {}),
    evidence: [...new Map(evidence.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] };
});
if (args.has("camp-resident-scenes")) profiles.push(...readReviewedCampResidentProfiles(args.get("camp-resident-scenes"),
  args.get("destinations"), destinations, text, root));
if (base) profiles.unshift(...base.profiles);
if (new Set(profiles.map(({ characterContentId, anchorContentId }) => `${characterContentId}/${anchorContentId}`)).size !== profiles.length) throw new Error("Duplicate scene targets");
if (recipe.logicalStatements || recipe.profiles.some((profile) => profile.storyDisplayName || profile.deathDropsUnavailable)) {
  for (const file of [import.meta.filename, "scripts/lib/reviewed-scene-display-name.mjs", "scripts/lib/localization.mjs",
    "scripts/lib/reviewed-story-rules.mjs", "scripts/lib/logical-reviewed-story-rules.mjs", "scripts/lib/story-scene-recipe.mjs", "scripts/lib/story-source-lines.mjs"]) text(file);
}
for (const file of Object.keys(hashes)) text(file);
const outputPath = path.resolve(root, args.get("output"));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
writeGeneratedFile(outputPath, `${JSON.stringify({ schemaVersion: 1,
  scope: "Reviewed scene presentation and conditional authored inventory; does not infer current equipment or delete transferred items.",
  inputs: { recipe: relative(path.resolve(root, args.get("recipe"))), destinations: relative(path.resolve(root, args.get("destinations"))),
    ...(args.has("camp-resident-scenes") ? { campResidentScenes: relative(path.resolve(root, args.get("camp-resident-scenes"))) } : {}),
    ...(base ? { baseCatalog: relative(path.resolve(root, args.get("base-catalog"))) } : {}),
    ...(args.has("items") ? { items: relative(path.resolve(root, args.get("items"))) } : {}) },
  profiles, hashes }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, profiles: profiles.length, reviewedRules: reviews.size }, null, 2));
