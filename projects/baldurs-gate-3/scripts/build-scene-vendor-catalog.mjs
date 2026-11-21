import fs from "node:fs";
import path from "node:path";
import { readStoryFacts, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { bindStoryArguments, substituteStoryArguments } from "./lib/story-destination.mjs";
import { mergeStoryDestinationEvidence } from "./lib/story-destination-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (filename) => JSON.parse(fs.readFileSync(path.join(root, filename), "utf8"));
const recipe = read("map-sources/config/scene-vendors.json");
const destinations = read("map-sources/catalog/story-location-relations.json").scriptedDestinations;
const treasures = read("map-sources/catalog/treasure-tables.json").tables;
const sources = [...new Set([recipe.runtimeSource, ...recipe.entries.map(({ sourcePath }) => sourcePath)])];
const facts = readStoryFacts([...new Set(sources.map((file) => path.dirname(path.join(root, file))))], root);
const bySource = Map.groupBy(facts, ({ evidence }) => evidence.sourcePath);
const rules = new Map(sources.map((file) => [file, createStoryRuleLookup(fs.readFileSync(path.join(root, file), "utf8"))]));
const canonical = (value) => parseEndpoint(value)?.id ?? value.replace(/^\([A-Z]+\)/, "").trim();
const guardKey = (fact, bindings) => `${fact.negated ? "NOT " : ""}${fact.predicate}(${substituteStoryArguments(fact.arguments, bindings).map(canonical).join(",")})`;
const at = (file, line) => {
  const fact = bySource.get(file)?.find(({ evidence }) => evidence.sourceLine === line);
  if (!fact || rules.get(file)(line)?.debugOnly) throw new Error(`Missing or debug-only source statement: ${file}:${line}`);
  return fact;
};
const context = (fact) => {
  const file = fact.evidence.sourcePath;
  const rule = rules.get(file)(fact.evidence.sourceLine);
  if (!rule || rule.debugOnly || !rule.actionLine) throw new Error(`Not a normal source action: ${file}:${fact.evidence.sourceLine}`);
  const inside = bySource.get(file).filter(({ evidence }) => evidence.sourceLine >= rule.sourceLine && evidence.sourceLine <= rule.endLine);
  const guards = inside.filter(({ evidence }) => evidence.sourceLine < rule.actionLine);
  // Do not silently ignore comparisons or multiline expressions that the fact
  // reader cannot represent; these reviewed setup rules use predicate guards.
  if (rule.guards.filter((line) => line !== "AND").length !== guards.length) throw new Error(`Unsupported source guards: ${file}:${rule.sourceLine}`);
  return { rule, header: guards[0], guards: guards.slice(1),
    actions: inside.filter(({ evidence }) => evidence.sourceLine >= rule.actionLine) };
};
const mergeBindings = (target, extra) => {
  if (!extra) throw new Error("Source arguments do not bind");
  for (const [key, value] of extra) {
    if (target.has(key) && canonical(target.get(key)) !== canonical(value)) throw new Error(`Conflicting source binding ${key}`);
    target.set(key, value);
  }
};
const assertStock = (fact, bindings, entry, tableId) => {
  const args = substituteStoryArguments(fact.arguments, bindings);
  if (fact.negated || fact.predicate !== "PROC_SetCustomTradeTreasure"
    || parseEndpoint(args[0])?.id !== entry.characterId || args[1] !== JSON.stringify(tableId)
    || !treasures[tableId]?.namedStockIds) throw new Error(`Invalid scene stock: ${entry.id}/${tableId}`);
};
const runtimeFacts = bySource.get(recipe.runtimeSource) ?? [];
const runtimeAssignment = runtimeFacts.find(({ predicate }) => predicate === "SetCustomTradeTreasure");
if (!runtimeAssignment) throw new Error("Missing original trade runtime assignment");
const runtime = context(runtimeAssignment);
if (runtime.header.predicate !== "PROC_SetCustomTradeTreasure"
  || !runtime.actions.some(({ predicate }) => predicate === "PROC_ClearGeneratedItems")
  || !runtime.actions.some(({ predicate }) => predicate === "PROC_ClearLastTradeTime")) throw new Error("Original trade reset contract changed");
const profiles = recipe.entries.map((entry) => {
  if (!entry.reason) throw new Error("Scene mappings require an explicit source review");
  const relation = destinations.find(({ character, anchor, evidence }) => character.id === entry.characterId && anchor.id === entry.anchorId
    && evidence.some(({ sourcePath, sourceLine }) => sourcePath === entry.sourcePath && sourceLine === entry.destinationLine));
  if (!relation) throw new Error(`Missing normal destination for ${entry.id}`);
  const destination = at(entry.sourcePath, entry.destinationLine);
  if (destination.predicate !== "TeleportTo") throw new Error(`Unsupported scene destination: ${entry.id}`);
  const placed = context(destination);
  const bindings = bindStoryArguments(destination.arguments.slice(0, 2), [relation.character.token, relation.anchor.token]);
  if (!bindings) throw new Error(`Destination binding failed: ${entry.id}`);
  for (const guard of placed.guards.filter(({ predicate, negated }) => predicate.startsWith("DB_") && !negated)) {
    for (const evidence of relation.evidence) {
      const row = at(evidence.sourcePath, evidence.sourceLine);
      if (row.section !== "init" || row.negated || row.predicate !== guard.predicate) continue;
      const bound = bindStoryArguments(guard.arguments, row.arguments);
      if (bound) mergeBindings(bindings, bound);
    }
  }
  const stock = at(entry.sourcePath, entry.stockLine);
  const setup = context(stock);
  const activationEvidence = [];
  let setupBindings;
  if (entry.activation === "procedure-overload") {
    if (setup.header.predicate !== placed.header.predicate) throw new Error(`Unrelated setup overload: ${entry.id}`);
    setupBindings = bindStoryArguments(setup.header.arguments, substituteStoryArguments(placed.header.arguments, bindings));
  } else if (entry.activation === "same-rule-call") {
    const call = at(entry.sourcePath, entry.callLine);
    if (call.negated || !placed.actions.includes(call) || call.predicate !== setup.header.predicate) throw new Error(`Setup is not called by the destination branch: ${entry.id}`);
    setupBindings = bindStoryArguments(setup.header.arguments, substituteStoryArguments(call.arguments, bindings));
    activationEvidence.push(call.evidence);
  } else if (entry.activation === "init-sibling") {
    for (const header of [placed.header, setup.header]) {
      const calls = bySource.get(entry.sourcePath).filter((fact) => fact.section === "init" && !fact.negated && fact.predicate === header.predicate
        && bindStoryArguments(header.arguments, fact.arguments));
      if (calls.length !== 1 || header.arguments.some((argument) => argument.trim())) throw new Error(`Ambiguous INIT activation: ${entry.id}`);
      activationEvidence.push(calls[0].evidence);
    }
    setupBindings = new Map();
  } else throw new Error(`Unknown scene activation ${entry.activation}`);
  if (!setupBindings) throw new Error(`Setup arguments do not bind: ${entry.id}`);
  const destinationGuards = new Set(placed.guards.map((fact) => guardKey(fact, bindings)));
  if (setup.guards.some((fact) => !destinationGuards.has(guardKey(fact, setupBindings)))) throw new Error(`Stock needs conditions not proven by this destination: ${entry.id}`);
  assertStock(stock, setupBindings, entry, entry.tableId);
  const evidence = mergeStoryDestinationEvidence([...relation.evidence, placed.header.evidence, ...placed.guards.map(({ evidence }) => evidence),
    ...activationEvidence, setup.header.evidence, ...setup.guards.map(({ evidence }) => evidence), stock.evidence,
    runtime.header.evidence, ...runtime.actions.map(({ evidence }) => evidence)]);
  const conditionalStock = (entry.conditionalStock ?? []).map((variant) => {
    if (!variant.reason || !variant.localizedConditions?.en || !variant.stockLines?.length) throw new Error(`Unreviewed conditional stock: ${entry.id}`);
    const conditionGroups = variant.stockLines.map((line) => {
      const action = at(entry.sourcePath, line);
      const branch = context(action);
      const bound = branch.header.predicate === setup.header.predicate
        ? bindStoryArguments(branch.header.arguments, substituteStoryArguments(setup.header.arguments, setupBindings)) : new Map();
      if (!bound || !branch.guards.length) throw new Error(`Missing conditional branch: ${entry.id}:${line}`);
      assertStock(action, bound, entry, variant.tableId);
      return { trigger: branch.header.evidence, conditions: branch.guards.map((fact) => ({
        predicate: fact.predicate, arguments: substituteStoryArguments(fact.arguments, bound), negated: fact.negated, evidence: fact.evidence,
      })), evidence: [branch.header.evidence, ...branch.guards.map(({ evidence }) => evidence), action.evidence] };
    });
    const baseIds = new Set(treasures[entry.tableId].namedStockIds);
    const expandedIds = treasures[variant.tableId].namedStockIds;
    if ([...baseIds].some((id) => !expandedIds.includes(id))) throw new Error(`Conditional replacement removes base stock; an exclusive-variant model is required: ${entry.id}`);
    return { id: variant.id, tradeTables: [variant.tableId], stockIds: expandedIds.filter((id) => !baseIds.has(id)),
      localizedConditions: variant.localizedConditions, conditionGroups, reason: variant.reason };
  });
  return { id: entry.id, characterContentId: entry.characterId, anchorContentId: entry.anchorId,
    tradeTables: [entry.tableId], conditionalStock, evidence, reason: entry.reason };
});
if (new Set(profiles.map(({ characterContentId, anchorContentId }) => `${characterContentId}/${anchorContentId}`)).size !== profiles.length) throw new Error("Duplicate scene vendor mapping");
writeGeneratedFile(path.join(root, "map-sources/catalog/scene-vendors.json"), `${JSON.stringify({ schemaVersion: 1, profiles }, null, 2)}\n`);
console.log(`Validated ${profiles.length} scene vendor profiles and ${profiles.reduce((sum, entry) => sum + entry.conditionalStock.length, 0)} conditional stock variants.`);
