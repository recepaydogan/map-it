import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createReviewedStoryRuleReader } from "./lib/reviewed-story-rules.mjs";
import { parseEndpoint, splitArguments } from "./lib/story-goal-facts.mjs";
import { readVerifiedSceneContentCatalog } from "./lib/scene-content-profile.mjs";
import { readVerifiedEquipmentItemCatalog } from "./lib/equipment-loot-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { readVerifiedCampResidentSourceAudit } from "./lib/reviewed-camp-resident-profiles.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 7) throw new Error("Usage: build-camp-scene-content.mjs <recipe> <destinations> <base-scenes> <equipment-items> <fresh-output>");
const [recipePath, destinationsPath, basePath, equipmentPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
if (fs.existsSync(output)) throw new Error("Use a fresh scene output");
const hashes = {}, relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const text = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = createHash("sha256").update(data).digest("hex");
  if (hashes[key] && hashes[key] !== hash) throw new Error(`Changed scene input: ${key}`);
  hashes[key] = hash; return data.toString("utf8");
};
const recipe = JSON.parse(text(recipePath)), destinations = JSON.parse(text(destinationsPath));
const residentAnchors = recipe.sourceAudit ? readVerifiedCampResidentSourceAudit(recipe, destinationsPath, text, root) : null;
const base = readVerifiedSceneContentCatalog(basePath, root); text(basePath);
for (const file of Object.keys(base.hashes)) text(file);
for (const [file, hash] of Object.entries(destinations.campEntryReviews.hashes)) {
  text(file); if (hashes[relative(file)] !== hash) throw new Error(`Stale camp-entry proof: ${file}`);
}
const { catalog: equipment, items } = readVerifiedEquipmentItemCatalog(equipmentPath, root); text(equipmentPath);
for (const file of Object.keys(equipment.hashes)) text(file);
const itemsById = new Map(items.map((item) => [item.id, item]));
const reader = createReviewedStoryRuleReader(text), reviews = new Map(recipe.reviews.map((review) => [review.id, reader.verify(review)]));
if (recipe.schemaVersion !== 1 || reviews.size !== recipe.reviews.length) throw new Error("Invalid camp scene reviews");
for (const entry of recipe.sourceStatements ?? []) {
  const line = text(entry.sourcePath).split(/\r?\n/)[entry.sourceLine - 1]?.trim().replace(/;$/, "");
  if (line !== entry.statement) throw new Error(`Changed scene source statement: ${entry.sourcePath}:${entry.sourceLine}`);
}
const templates = JSON.parse(text("map-sources/catalog/root-templates.json")).templates;
const equipmentChange = (profile, rule) => {
  if (!profile.equipmentReview && !profile.equipmentGrantReview) return undefined;
  const grantOnly = !!profile.equipmentGrantReview;
  if (grantOnly) rule = reviews.get(profile.equipmentGrantReview);
  if (!rule || grantOnly && profile.equipmentReview) throw new Error(`Ambiguous equipment change: ${profile.id}`);
  const targeted = (predicate) => rule.actions.filter((line) => line.startsWith(`${predicate}(`)
    && parseEndpoint(splitArguments(line)[0])?.id === profile.characterContentId);
  const remove = targeted("PROC_CharacterRemoveEquipmentPermanently"), equip = targeted("CharacterGiveEquipmentSet"), transform = targeted("Transform");
  if (remove.length !== (grantOnly ? 0 : 1) || equip.length !== 1 || transform.length !== 1) throw new Error(`Unbound equipment/appearance effects: ${profile.id}`);
  const removal = grantOnly ? { evidence: [] } : reviews.get(profile.equipmentReview);
  if (!grantOnly && !removal?.actions.includes("RequestDelete(_Item)")) throw new Error("Missing equipment-removal contract");
  const removalSource = grantOnly ? undefined : recipe.reviews.find(({ id }) => id === profile.equipmentReview).sourcePath;
  const sourceLines = grantOnly ? [] : text(removalSource).split(/\r?\n/), kb = grantOnly ? 0 : sourceLines.indexOf("KBSECTION");
  const slots = sourceLines.slice(0, kb).flatMap((line, index) => {
    const match = line.trim().match(/^DB_EquippedItemSlots\("([^"]+)"\);$/);
    return match ? [{ slot: match[1], evidence: { sourcePath: removalSource, sourceLine: index + 1, statement: line.trim().slice(0, -1) } }] : [];
  });
  if (kb < 0 || slots.length !== (grantOnly ? 0 : 15) || new Set(slots.map(({ slot }) => slot)).size !== slots.length) throw new Error("Equipped-slot source requires review");
  const definitionId = splitArguments(equip[0])[1].match(/^"([^"]+)"$/)?.[1], definition = equipment.definitions[definitionId];
  if (!definition?.groups.length) throw new Error(`Unknown scene equipment: ${definitionId}`);
  const unresolvedEntries = [];
  const resolvedItems = definition.groups.flatMap((group) => {
    if (group.entries.length !== 1) throw new Error(`Equipment alternatives need explicit conditional semantics: ${definitionId}`);
    const entry = group.entries[0], ref = equipment.references[entry.statsId];
    if ((profile.reviewOnlyEquipmentEntries ?? []).includes(entry.statsId)) {
      if (ref?.status !== "review" || !equipment.definitions[entry.statsId]) throw new Error(`Unreviewed equipment ambiguity: ${entry.statsId}`);
      unresolvedEntries.push({ statsId: entry.statsId, reason: "equipment-definition-reference-not-resolved-item",
        evidence: [{ sourcePath: definition.sourcePath, sourceLine: entry.sourceLine, statement: `add equipment entry "${entry.statsId}"` }] });
      return [];
    }
    const item = ref?.status === "resolved" && ref.itemIds.length === 1 ? itemsById.get(ref.itemIds[0]) : undefined;
    if (!item || item.statsId !== entry.statsId || !item.templateIds.includes(ref.rootTemplateId)) throw new Error(`Unresolved scene equipment item: ${entry.statsId}`);
    return [{ itemId: item.id, templateId: ref.rootTemplateId, statsId: item.statsId, title: item.name,
      localizedNames: item.localizedNames, amount: 1, evidence: [{ sourcePath: definition.sourcePath,
        sourceLine: entry.sourceLine, statement: `add equipment entry "${entry.statsId}"` }] }];
  });
  if (unresolvedEntries.length !== (profile.reviewOnlyEquipmentEntries ?? []).length) throw new Error("Equipment review entry set changed");
  const transformArgs = splitArguments(transform[0]), templateId = parseEndpoint(transformArgs[1])?.id, ruleId = parseEndpoint(transformArgs[2])?.id;
  const target = templates[templateId];
  if (!target) throw new Error(`Missing scene template: ${templateId}`);
  const nativePath = `map-sources/extracted/root-templates/${target.provenance}`;
  const native = JSON.parse(text(nativePath)).save.regions.Templates.GameObjects.find((object) => object.MapKey?.value === templateId);
  if (native?.Stats?.value !== target.stats || native?.Icon?.value !== target.icon
    || !grantOnly && native?.Equipment?.value !== definitionId) throw new Error("Scene template fields differ from original");
  const rulebook = text(profile.appearanceRuleSource), ruleBlocks = rulebook.split('<node id="Rule">').slice(1);
  const blocks = ruleBlocks.filter((block) => block.includes(`value="${ruleId}"`));
  if (blocks.length !== 1 || !blocks[0].includes('id="ChangeIcon" type="bool" value="true"')) throw new Error("Unverified appearance icon rule");
  let localizedTitles;
  if (profile.useAppearanceName) {
    if (!blocks[0].includes('id="RetainDisplayName" type="bool" value="false"')
      || native.DisplayName?.handle !== target.displayNameHandle) throw new Error("Unverified scene display name");
    localizedTitles = {};
    for (const [language, sourcePath] of Object.entries(profile.nameSources)) {
      const xml = text(sourcePath), matches = [...xml.matchAll(new RegExp(`<content contentuid="${target.displayNameHandle}"[^>]*>([^<]+)</content>`, "g"))];
      if (matches.length !== 1 || matches[0][1] !== target.displayName[language]) throw new Error(`Native scene name mismatch: ${language}`);
      localizedTitles[language] = matches[0][1];
    }
    if (!localizedTitles.en) throw new Error("Scene display name lacks English source");
  }
  return { ...(localizedTitles ? { localizedTitles } : {}),
    equipmentChange: { mode: grantOnly ? "give-equipment-set" : "replace-equipped-slots", definitionId, removedSlots: slots.map(({ slot }) => slot),
    localizedConditions: profile.lootAvailability, items: resolvedItems,
    ...(unresolvedEntries.length ? { unresolvedEntries } : {}),
    evidence: [...slots.map(({ evidence }) => evidence), ...removal.evidence, ...rule.evidence] },
  appearance: { templateId, iconId: target.icon, statsId: target.stats, ruleId, sourcePath: nativePath,
    ruleSourcePath: profile.appearanceRuleSource } };
};
const profiles = [...base.profiles];
for (const profile of recipe.profiles) {
  const rule = reviews.get(profile.review);
  if (!rule || !profile.localizedDescriptions?.en || !profile.lootAvailability?.en) throw new Error(`Incomplete visitor review: ${profile.id}`);
  const positions = new Map();
  for (const index of profile.positionRegistrations ?? []) {
    const entry = recipe.sourceStatements?.[index], statement = entry?.statement, args = statement ? splitArguments(statement) : [];
    const anchor = parseEndpoint(args[0] ?? ""), camp = args[1]?.match(/^"([A-Z]+)"$/)?.[1];
    const predicate = statement?.slice(0, statement.indexOf("("));
    const guard = rule.guards.find((line) => line.startsWith(`${predicate}(`)), binding = guard ? splitArguments(guard) : [];
    const action = rule.actions.find((line) => line.startsWith("TeleportTo(")
      && parseEndpoint(splitArguments(line)[0])?.id === profile.characterContentId && splitArguments(line)[1] === binding[0]);
    if (!anchor || !camp || positions.has(anchor.id) || args.length !== 2 || binding.length !== 2
      || !rule.guards.includes(`DB_ActiveCamp(${binding[1]})`) || !action
      || entry.sourceLine >= reader.source(entry.sourcePath).lines.indexOf("KBSECTION") + 1) throw new Error(`Unbound native camp position: ${profile.id}/${index}`);
    positions.set(anchor.id, { camp, entry, action });
  }
  if (profile.positionRegistrations && (!positions.size || profile.contextId)) throw new Error(`Ambiguous camp scene selection: ${profile.id}`);
  if (profile.contextId && !residentAnchors) throw new Error(`Missing independently audited resident source: ${profile.id}`);
  const selected = destinations.scriptedDestinations.filter((relation) => relation.character.id === profile.characterContentId
    && (profile.contextId ? relation.campResidentContext?.id === profile.contextId
      : positions.size ? positions.has(relation.anchor.id) : relation.campEntryContext && rule.evidence.some((entry) => entry.sourcePath === relation.campEntryContext.movement.evidence.sourcePath
        && entry.sourceLine === relation.campEntryContext.movement.evidence.sourceLine)));
  if (selected.length !== profile.expectedAnchors) throw new Error(`Visitor anchor set changed: ${profile.id}`);
  const replacement = equipmentChange(profile, rule);
  for (const relation of selected) {
    const registered = positions.get(relation.anchor.id);
    if (registered && (!relation.evidence.some((entry) => JSON.stringify(entry) === JSON.stringify(registered.entry))
      || !relation.evidence.some((entry) => entry.statement === registered.action && rule.evidence.some((source) => JSON.stringify(source) === JSON.stringify(entry))))) {
      throw new Error(`Scene relation lacks native registration/action evidence: ${relation.id}`);
    }
    const context = profile.contextId ? relation.campResidentContext : relation.campEntryContext;
    if (profile.contextId && (!residentAnchors.has(`${relation.character.id}/${relation.anchor.id}`)
      || !rule.evidence.every((entry) => context.recruitment.evidence.some((source) => source.sourcePath === entry.sourcePath
        && source.sourceLine === entry.sourceLine && source.statement === entry.statement)))) throw new Error(`Unbound recruitment review: ${profile.id}`);
    const contextEvidence = registered ? [registered.entry] : profile.contextId ? [context.registration, context.campFlags,
      ...context.recruitment.evidence, ...context.runtime.flatMap(({ evidence }) => evidence)]
      : [...context.registrations.map(({ evidence }) => evidence), ...context.nightEvidence.flatMap(({ evidence }) => evidence.map((entry) => entry.evidence))];
    const descriptions = replacement ? Object.fromEntries(Object.entries(profile.localizedDescriptions).map(([language, description]) =>
      [language, `${description} ${replacement.equipmentChange.items.map((item) => item.localizedNames[language] ?? item.title).join(", ")}.`])) : profile.localizedDescriptions;
    profiles.push({ id: `${profile.id}:${registered?.camp ?? relation.camp}`, characterContentId: profile.characterContentId, anchorContentId: relation.anchor.id,
      kind: "npc", omitAuthoredCombat: false, localizedDescriptions: descriptions, lootAvailability: profile.lootAvailability,
      ...(replacement ?? {}), evidence: [...relation.evidence, ...rule.evidence,
        ...contextEvidence,
        ...(profile.supportingReviews ?? []).flatMap((id) => {
          if (!reviews.has(id)) throw new Error(`Missing supporting review: ${id}`);
          return reviews.get(id).evidence;
        }), ...(profile.sourceStatementIndexes ?? []).map((index) => {
          if (!recipe.sourceStatements?.[index]) throw new Error(`Missing source statement: ${index}`);
          return recipe.sourceStatements[index];
        })] });
  }
}
if (new Set(profiles.map((profile) => `${profile.characterContentId}/${profile.anchorContentId}`)).size !== profiles.length) throw new Error("Duplicate scene targets");
if (residentAnchors) {
  const covered = new Set(profiles.map((profile) => `${profile.characterContentId}/${profile.anchorContentId}`));
  if ([...residentAnchors].some((key) => !covered.has(key))) throw new Error("Resident scene coverage is incomplete");
}
for (const file of Object.keys(hashes)) text(file);
writeGeneratedFile(output, `${JSON.stringify({ schemaVersion: 1, scope: recipe.scope,
  inputs: { recipe: relative(recipePath), destinations: relative(destinationsPath), baseCatalog: relative(basePath), equipmentItems: relative(equipmentPath) }, profiles, hashes }, null, 2)}\n`);
console.log(JSON.stringify({ profiles: profiles.length, addedProfiles: profiles.length - base.profiles.length,
  replacedEquipmentProfiles: profiles.filter((profile) => profile.equipmentChange).length, output }, null, 2));
