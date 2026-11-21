import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readStoryFacts, parseEndpoint, walkFiles } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Review actual camp-entry source, including runtime registrations. This is
// not a fixture suite, a general Osiris interpreter or a publication gate.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 4, "Usage: audit-camp-entry-source.mjs <catalog> <fresh-report>");
const [catalogPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outputRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outputRelative && !outputRelative.startsWith("..") && !path.isAbsolute(outputRelative) && !fs.existsSync(output), "Use a fresh audit report");
const hashes = {}, errors = [];
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), name = relative(absolute), hash = digest(data);
  assert(!hashes[name] || hashes[name] === hash, `Input changed: ${name}`);
  hashes[name] = hash;
  return data;
};
const roots = ["story-goals", "story-support/camp-entry-runtime-base", "story-support/camp-entry-runtime-patch",
  "story-support/camp-entry-runtime-dev-base", "story-support/camp-entry-runtime-dev-patch"].map((name) => path.join(root, "map-sources/extracted", name));
const overridden = new Set();
for (const [base, patch] of [[roots[1], roots[2]], [roots[3], roots[4]]]) {
  for (const file of walkFiles(patch)) overridden.add(relative(path.join(base, path.relative(patch, file))));
}
const sourceFiles = roots.flatMap(walkFiles).filter((file) => file.endsWith(".txt"));
for (const file of sourceFiles) bytes(file);
const facts = readStoryFacts(roots, root).filter(({ evidence }) => !overridden.has(evidence.sourcePath));
const bySource = Map.groupBy(facts, ({ evidence }) => evidence.sourcePath);
const lookups = new Map([...bySource.keys()].map((file) => [file, createStoryRuleLookup(bytes(file).toString("utf8"))]));
const ruleFor = (fact) => lookups.get(fact.evidence.sourcePath)(fact.evidence.sourceLine);
const key = (evidence) => `${evidence.sourcePath}:${evidence.sourceLine}:${evidence.statement}`;
const factIndex = new Map(facts.map((fact) => [key(fact.evidence), fact]));
const id = (value = "") => parseEndpoint(value)?.id;
const uncast = (value) => value.trim().replace(/^\([A-Z]+\)\s*/, "");
const variable = (value) => /^_[A-Za-z]\w*$/.test(uncast(value)) ? uncast(value) : null;
const literal = (value) => uncast(value).match(/^"([^"\\\r\n]*)"$/)?.[1];
const isAction = (fact) => fact.section === "init" || Boolean(ruleFor(fact)?.actionLine && fact.evidence.sourceLine >= ruleFor(fact).actionLine);
const positive = facts.filter((fact) => !fact.negated && isAction(fact) && !ruleFor(fact)?.debugOnly);
const rows = Map.groupBy(positive.filter(({ predicate }) => predicate.startsWith("DB_")), ({ predicate }) => predicate);
const context = (fact) => {
  const rule = ruleFor(fact);
  assert(rule?.actionLine, `Missing native rule: ${key(fact.evidence)}`);
  const inside = bySource.get(fact.evidence.sourcePath).filter(({ evidence }) => evidence.sourceLine >= rule.sourceLine && evidence.sourceLine <= rule.endLine);
  return { rule, guards: inside.filter(({ evidence }) => evidence.sourceLine < rule.actionLine),
    actions: inside.filter(({ evidence }) => evidence.sourceLine >= rule.actionLine) };
};
const sourceContext = (fact) => {
  const rule = ruleFor(fact);
  return { evidence: fact.evidence, negated: fact.negated, section: fact.section,
    ...(rule ? { rule: { kind: rule.kind, sourceLine: rule.sourceLine, guards: rule.guards, debugOnly: rule.debugOnly } } : {}) };
};
const deduplicate = (values) => [...new Map(values.map((value) => [JSON.stringify(value), value])).values()];

// The independent review follows literal UUIDs or one positive membership
// table, checking repeated variables and literal columns independently of the
// production binder. It retains each declaration's original runtime guards.
const matches = (patterns, values) => {
  if (patterns.length !== values.length) return false;
  const bindings = new Map();
  return patterns.every((pattern, index) => {
    const token = uncast(pattern), name = variable(pattern), value = id(values[index]) ?? uncast(values[index]);
    if (token === "_") return true;
    if (!name) return (id(pattern) ?? token) === value;
    if (bindings.has(name)) return bindings.get(name) === value;
    bindings.set(name, value);
    return true;
  });
};
const domain = (argument, guards) => {
  if (id(argument)) return [{ id: id(argument), evidence: [] }];
  const name = variable(argument);
  if (!name) return [];
  return guards.filter((guard) => !guard.negated && guard.predicate.startsWith("DB_")
    && guard.arguments.some((value) => variable(value) === name)).flatMap((guard) => {
    const index = guard.arguments.findIndex((value) => variable(value) === name);
    return (rows.get(guard.predicate) ?? []).filter((row) => id(row.arguments[index]) && matches(guard.arguments, row.arguments))
      .map((row) => ({ id: id(row.arguments[index]), evidence: [sourceContext(guard), sourceContext(row)] }));
  });
};
const hooks = new Map([["PROC_StartDialog_AddExtraSpeakers", "DB_CampNight_SCO"],
  ["PROC_CampfireMoment_PreDialog", "DB_CampNight_CFM"], ["QRY_Camp_StartSoloDream_CustomDialogStart", "DB_CampNight_SoloDream"]]);
const sites = new Map();
const trace = (fact, trail = new Set()) => {
  const { rule, guards } = context(fact), header = guards[0];
  const siteKey = `${fact.evidence.sourcePath}:${rule.sourceLine}`;
  if (trail.has(siteKey) || trail.size >= 5) return { nights: [], unresolved: [siteKey] };
  sites.set(siteKey, { sourcePath: fact.evidence.sourcePath, ...rule });
  const next = new Set([...trail, siteKey]);
  const queued = guards.filter((guard) => guard.predicate === "DB_Camp_QueuedNight" && !guard.negated);
  if (queued.length) {
    const nights = queued.flatMap((guard) => domain(guard.arguments[0], guards)
      .filter((entry) => !guards.some((negative) => negative.negated && negative.predicate === guard.predicate && id(negative.arguments[0]) === entry.id))
      .map((entry) => ({ ...entry, evidence: [...entry.evidence, sourceContext(guard)] })));
    return { nights, unresolved: nights.length ? [] : [siteKey] };
  }
  const registration = hooks.get(header?.predicate);
  if (registration) {
    const dialogs = domain(header.arguments[0], guards);
    const nights = dialogs.flatMap((dialog) => (rows.get(registration) ?? [])
      .filter((row) => id(row.arguments.at(-1)) === dialog.id && id(row.arguments[0]))
      .map((row) => ({ id: id(row.arguments[0]), dialogId: dialog.id,
        evidence: [...dialog.evidence, sourceContext(header), sourceContext(row)] })));
    return { nights, unresolved: dialogs.length && dialogs.every((dialog) => nights.some((night) => night.dialogId === dialog.id)) ? [] : [siteKey] };
  }
  if (!["PROC", "QRY"].includes(rule.kind) || header.arguments.length !== 1 || header.arguments[0] !== "") {
    return { nights: [], unresolved: [siteKey] };
  }
  // Zero-argument helpers require no guessed argument forwarding. QRY calls
  // are guards, not actions; include both kinds of native invocation.
  const callers = facts.filter((candidate) => candidate.predicate === header.predicate && !candidate.negated
    && candidate.arguments.length === 1 && candidate.arguments[0] === ""
    && ruleFor(candidate)?.sourceLine !== undefined && !ruleFor(candidate)?.debugOnly
    && !(candidate.evidence.sourcePath === header.evidence.sourcePath && ruleFor(candidate).sourceLine === rule.sourceLine));
  if (!callers.length) return { nights: [], unresolved: [siteKey] };
  const branches = callers.map((caller) => {
    const branch = trace(caller, next);
    return { ...branch, nights: branch.nights.map((night) => ({ ...night, evidence: [...night.evidence, sourceContext(caller), sourceContext(header)] })) };
  });
  return { nights: branches.flatMap(({ nights }) => nights), unresolved: branches.flatMap(({ unresolved }) => unresolved) };
};

const catalog = JSON.parse(bytes(catalogPath));
const relations = catalog.scriptedDestinations.filter((relation) => relation.evidence.some(({ statement }) => statement.startsWith("DB_Camp(")));
const reviewed = relations.map((relation) => {
  const evidenceFacts = relation.evidence.map((entry) => {
    const fact = factIndex.get(key(entry));
    assert(fact && !fact.negated, `Unmatched positive native evidence: ${key(entry)}`);
    return fact;
  });
  const camps = evidenceFacts.filter((fact) => fact.section === "init" && fact.predicate === "DB_Camp"
    && id(fact.arguments[3]) === relation.anchor.id);
  const actions = evidenceFacts.filter((fact) => fact.predicate === "TeleportTo" && isAction(fact) && id(fact.arguments[0]) === relation.character.id);
  assert(camps.length === 1 && actions.length === 1, `Ambiguous camp entry: ${relation.id}`);
  const camp = literal(camps[0].arguments[0]), action = actions[0], local = context(action);
  assert(camp, `Missing literal camp: ${relation.id}`);
  const active = local.guards.find((guard) => guard.predicate === "DB_ActiveCamp" && !guard.negated);
  const binding = local.guards.find((guard) => guard.predicate === "DB_Camp" && !guard.negated);
  assert(active && binding && variable(active.arguments[0]) === variable(binding.arguments[0])
    && variable(action.arguments[1]) === variable(binding.arguments[3]), `Unbound active camp: ${relation.id}`);
  const legacy = local.guards.filter(({ predicate }) => /^QRY_BG3_SavegameIsOlderThan$/i.test(predicate));
  const traced = legacy.length ? { nights: [], unresolved: [] } : trace(action);
  const nights = [...new Set(traced.nights.map(({ id }) => id))].sort();
  const registrations = (rows.get("DB_CampNight_Camp") ?? []).filter((row) => nights.includes(id(row.arguments[0])));
  const allowedCamps = [...new Set(registrations.map((row) => literal(row.arguments[1])).filter(Boolean))].sort();
  const localEffects = local.actions.filter((effect) => !effect.negated && (id(effect.arguments[0]) === relation.character.id
    || effect.predicate === "ToInventory" && id(effect.arguments[1]) === relation.character.id));
  const offstage = localEffects.some((effect) => ["SetOnStage", "PROC_SetOnStage"].includes(effect.predicate) && effect.arguments[1] === "0");
  const excludedCampGuards = local.guards.filter((guard) => guard.negated && guard.predicate === "DB_ActiveCamp" && literal(guard.arguments[0]) === camp);
  const dynamicRegistrations = (rows.get("DB_CampNight_Camp") ?? []).filter((row) => !id(row.arguments[0])
    && variable(row.arguments[0])).filter((row) => {
    const values = domain(row.arguments[0], context(row).guards);
    // Unrelated, fully literal source tables cannot add these scene nights.
    return !values.length || values.some((entry) => nights.includes(entry.id));
  });
  const unresolved = deduplicate([...traced.unresolved, ...dynamicRegistrations.map((row) => key(row.evidence))]);
  return { id: relation.id, actor: relation.character, anchor: relation.anchor, camp, movement: sourceContext(action),
    classification: legacy.length ? "legacy-save-repair" : offstage ? "offstage-dialog-setup"
      : !nights.length || unresolved.length ? "unresolved-scene-reachability"
        : allowedCamps.includes(camp) ? "camp-listed-conditional-scene" : "camp-not-listed-for-scene",
    contradictedActiveCamp: excludedCampGuards.map(sourceContext), nights, allowedCamps,
    campRegistration: sourceContext(camps[0]), nightEvidence: deduplicate(traced.nights),
    registrations: registrations.map(sourceContext), effects: localEffects.map(sourceContext), unresolved };
});
const queueWrites = positive.filter(({ predicate }) => predicate === "DB_Camp_QueuedNight").map(sourceContext);
const bestNightWrites = positive.filter(({ predicate }) => predicate === "DB_Camp_BestCampNight").map(sourceContext);
assert(queueWrites.length, "Missing native camp scheduler");
const schedulerProof = [];
for (const fact of positive.filter(({ predicate }) => predicate === "DB_Camp_QueuedNight")) {
  const { guards } = context(fact);
  const debug = guards.find((guard) => !guard.negated && guard.predicate === "DB_CampNight_DEBUG_ForcedEntry");
  const selected = guards.find((guard) => !guard.negated && guard.predicate === "DB_Camp_BestCampNight");
  assert(debug || selected, `Unreviewed queued-night writer: ${key(fact.evidence)}`);
  assert(variable(fact.arguments[0]) && variable((debug ?? selected).arguments[0]) === variable(fact.arguments[0]), "Unbound night queue");
  schedulerProof.push({ kind: debug ? "explicit-debug-only-queue" : "selected-night-queue", evidence: sourceContext(fact) });
}
for (const fact of positive.filter(({ predicate }) => predicate === "DB_Camp_BestCampNight")) {
  if (uncast(fact.arguments[0]).endsWith("_00000000-0000-0000-0000-000000000000")) continue;
  const { guards } = context(fact), camp = guards.find((guard) => !guard.negated && guard.predicate === "DB_CampNight_Camp"),
    active = guards.find((guard) => !guard.negated && guard.predicate === "DB_ActiveCamp");
  assert(camp && active && variable(fact.arguments[0]) && variable(camp.arguments[0]) === variable(fact.arguments[0])
    && variable(camp.arguments[1]) && variable(camp.arguments[1]) === variable(active.arguments[0]), `Unbound selected camp: ${key(fact.evidence)}`);
  schedulerProof.push({ kind: "camp-constrained-night-selection", evidence: sourceContext(fact) });
}
const offstageHeaders = facts.filter((fact) => fact.predicate === "PROC_SetOnStage" && !isAction(fact)
  && fact.arguments.length === 2 && fact.arguments[1] === "0");
assert.equal(offstageHeaders.length, 1, "Unknown native offstage helper overloads");
const offstageHeader = offstageHeaders[0], offstageContext = context(offstageHeader);
assert(offstageContext.guards.length === 1 && offstageContext.actions.some((fact) => !fact.negated && fact.predicate === "SetOnStage"
  && variable(fact.arguments[0]) === variable(offstageHeader.arguments[0]) && fact.arguments[1] === "0"), "Missing unconditional native offstage effect");
const byActor = [...Map.groupBy(reviewed, ({ actor }) => actor.id)].map(([actorId, entries]) => ({ actorId,
  name: entries[0].actor.name, entries: entries.length,
  classifications: Object.fromEntries([...Map.groupBy(entries, ({ classification }) => classification)].map(([name, values]) => [name, values.length])),
  nights: [...new Set(entries.flatMap(({ nights }) => nights))], allowedCamps: entries[0].allowedCamps,
  effects: entries[0].effects, unresolved: deduplicate(entries.flatMap(({ unresolved }) => unresolved)) }));
const stats = { nativeFacts: facts.length, relations: reviewed.length, actors: byActor.length,
  classifications: Object.fromEntries([...Map.groupBy(reviewed, ({ classification }) => classification)].map(([name, values]) => [name, values.length])),
  explicitActiveCampContradictions: reviewed.filter(({ contradictedActiveCamp }) => contradictedActiveCamp.length).length };
bytes(import.meta.filename);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Changed source: ${file}`);
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-entry-native-source-survey", catalogPath, stats, byActor, reviewed,
  queueWrites, bestNightWrites, schedulerProof, offstageRuntime: [sourceContext(offstageHeader), ...offstageContext.actions.map(sourceContext)],
  sourceFiles: sourceFiles.map(relative), overriddenSources: [...overridden], tracedRuleSites: [...sites.values()], hashes, errors,
  scope: "All catalog relations bound through DB_Camp. Camp registration lists include conditional runtime additions, not only INIT rows. Camp-listed does not prove current presence, visibility, faction, equipment, stock or loot. Missing-list classifications are scoped to the traced night routes; this report does not remove any relation or approve publication. Legacy save repair and offstage setup are distinct from normal encounter locations. Runtime and branch conditions remain in the evidence." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, byActor: byActor.map(({ effects, ...entry }) => ({ ...entry, effectCount: effects.length })), errors }, null, 2));
