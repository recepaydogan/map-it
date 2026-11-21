import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readStoryFacts, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const beforePath = path.resolve(root, process.argv[2] ?? "map-sources/catalog/scripted-item-transfers.json");
const afterPath = path.resolve(root, process.argv[3] ?? "map-sources/audits/scripted-item-transfers-source-rules.json");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = read(beforePath), after = read(afterPath);
const key = (evidence) => `${evidence.sourcePath}:${evidence.sourceLine}:${evidence.statement}`;
const facts = new Map(readStoryFacts([path.join(root, "map-sources/extracted/story-goals")], root).map((fact) => [key(fact.evidence), fact]));
const rules = new Map(), errors = [], removed = [], refreshed = [], repairOnly = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const excluded = new Map((after.excludedTransfers ?? []).map((row) => [key(row.evidence[0]), row]));
const next = new Map(after.transfers.map((row) => [row.id, row]));
check(next.size === after.transfers.length, "Duplicate transfer IDs");
for (const previous of before.transfers) {
  const current = next.get(previous.id);
  const retainedEvidence = new Set(current?.evidence.map(key));
  for (const evidence of previous.evidence) check(retainedEvidence.has(key(evidence)) || excluded.has(key(evidence)), `Source statement lost without a recorded decision: ${key(evidence)}`);
  if (!current) removed.push({ id: previous.id, item: previous.item, owner: previous.owner,
    exclusions: previous.evidence.map((evidence) => excluded.get(key(evidence))) });
  else {
    for (const field of ["id", "kind", "item", "owner", "amount"]) check(isDeepStrictEqual(previous[field], current[field]), `Retained transfer ${field} changed: ${previous.id}`);
    if (!isDeepStrictEqual(previous.evidence, current.evidence)) refreshed.push(current.id);
  }
}
for (const transfer of after.transfers) {
  check(transfer.evidence.length > 0, `Missing evidence: ${transfer.id}`);
  let repairStatements = 0;
  for (const evidence of transfer.evidence) {
    const fact = facts.get(key(evidence));
    check(fact && !fact.negated, `Inactive statement: ${key(evidence)}`);
    if (!fact) continue;
    if (!rules.has(evidence.sourcePath)) rules.set(evidence.sourcePath, createStoryRuleLookup(fs.readFileSync(path.join(root, evidence.sourcePath), "utf8")));
    const rule = rules.get(evidence.sourcePath)(evidence.sourceLine);
    check(!rule?.debugOnly && (!rule || rule.actionLine && evidence.sourceLine >= rule.actionLine), `Non-playable evidence: ${key(evidence)}`);
    const itemIndex = fact.predicate === "Equip" ? 1 : 0;
    const ownerIndex = fact.predicate === "Equip" ? 0 : 1;
    check(parseEndpoint(fact.arguments[itemIndex])?.id === (transfer.item.id ?? transfer.item.templateId), `Item argument mismatch: ${transfer.id}`);
    check(parseEndpoint(fact.arguments[ownerIndex])?.id === transfer.owner.id, `Owner argument mismatch: ${transfer.id}`);
    if (/SavegamePatch/i.test(evidence.sourcePath)) repairStatements += 1;
  }
  if (repairStatements === transfer.evidence.length) repairOnly.push(transfer.id);
}
// These removals need executable debug entry-point evidence, not a region
// comment alone. This protects normal helpers accidentally grouped as DEBUG.
for (const row of excluded.values()) {
  const header = row.rule?.guards[0] ?? "";
  check(row.reason === "debug-rule" && (/^PROC_\w*debug\w*\s*\(/i.test(header)
    || /^Flag(?:Set|Cleared)\([^\n]*debug/i.test(header)
    || row.rule.debugRegion && /^TextEvent\s*\(/.test(header)), `Exclusion requires additional source review: ${row.id}`);
  check(facts.has(key(row.evidence[0])), `Excluded statement absent from native source: ${row.id}`);
}
const report = { scope: "Transfer source/argument and exclusion conservation audit. Repair-only transfers are not normal acquisition proofs; location and quest-condition coverage remain separate.",
  beforePath, afterPath, hashes: { before: hash(beforePath), after: hash(afterPath) },
  stats: { previousTransfers: before.transfers.length, transfers: after.transfers.length, excludedStatements: excluded.size,
    removedTransfers: removed.length, refreshedTransfers: refreshed.length, repairOnlyTransfers: repairOnly.length },
  removed, refreshed, repairOnly, errors };
writeGeneratedFile(path.join(root, "map-sources/audits/scripted-item-transfer-source-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
