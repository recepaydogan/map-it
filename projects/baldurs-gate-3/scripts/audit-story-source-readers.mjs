import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { build } from "esbuild";
import { readStoryFacts } from "./lib/story-goal-facts.mjs";
import { readStorySourceLines } from "./lib/story-source-lines.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent token-pattern reconstruction over all real exported source files.
// No synthetic fixtures, browser interaction or application runtime is used.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 4) throw new Error("Usage: audit-story-source-readers.mjs <reader-snapshot> <report>");
const [snapshotPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, deltas = [], contextualChanges = [];
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const read = (file) => {
  const absolute = path.resolve(root, file), bytes = fs.readFileSync(absolute), key = relative(absolute);
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert(!hashes[key] || hashes[key] === hash, `Input changed: ${key}`);
  hashes[key] = hash;
  return bytes.toString("utf8");
};
const snapshot = JSON.parse(read(snapshotPath));
const loadBefore = async (file) => {
  const archived = snapshot.files.find((entry) => entry.file === file);
  assert(archived && archived.sha256 === createHash("sha256").update(archived.source).digest("hex"));
  const bundled = await build({ stdin: { contents: archived.source, resolveDir: path.dirname(path.resolve(root, file)), loader: "js" },
    bundle: true, platform: "node", format: "esm", write: false, metafile: true });
  for (const input of Object.keys(bundled.metafile.inputs)) if (input !== "<stdin>") read(input);
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
};
const beforeFacts = await loadBefore("scripts/lib/story-goal-facts.mjs");
const beforeRules = await loadBefore("scripts/lib/story-rule-context.mjs");
for (const file of [import.meta.filename, "scripts/lib/story-source-lines.mjs", "scripts/lib/story-goal-facts.mjs", "scripts/lib/story-rule-context.mjs"]) read(file);
const walk = (folder) => fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
const roots = ["map-sources/extracted/story-goals", "map-sources/extracted/story-support"].map((file) => path.resolve(root, file));
const files = roots.flatMap(walk).filter((file) => file.endsWith(".txt"));
const oldFacts = beforeFacts.readStoryFacts(roots, root), actualFacts = readStoryFacts(roots, root);
const keyOf = (fact) => `${fact.evidence.sourcePath}:${fact.evidence.sourceLine}`;
const indexed = (facts) => {
  const counts = new Map();
  return new Map(facts.map((fact) => {
    const key = keyOf(fact), ordinal = counts.get(key) ?? 0;
    counts.set(key, ordinal + 1);
    return [`${key}:${ordinal}`, fact];
  }));
};
const oldByKey = indexed(oldFacts), actualByKey = indexed(actualFacts);
assert.equal(oldByKey.size, oldFacts.length); assert.equal(actualByKey.size, actualFacts.length);
let independentlyRead = 0, checkedRules = 0, correctedHeaders = 0, blockComments = 0, lineComments = 0;
const boundaryPattern = /^(IF|IFF|PROC|QRY)(?:\s+(.+))?$/;
const independentlySplit = (statement) => {
  const body = statement.slice(statement.indexOf("(") + 1, -1), values = [];
  let depth = 0, start = 0;
  for (const token of body.matchAll(/"(?:\\[\s\S]|[^"\\])*"|[(),]/g)) {
    if (token[0] === "(") depth++;
    else if (token[0] === ")") depth--;
    else if (token[0] === "," && !depth) { values.push(body.slice(start, token.index).trim()); start = token.index + 1; }
  }
  values.push(body.slice(start).trim());
  return values;
};
for (const filename of files) {
  const sourcePath = relative(filename), source = read(filename), originalLines = source.split(/\r?\n/);
  const comments = [];
  const clean = source.replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (token, offset) => {
    if (token.startsWith('"')) return token;
    if (token.startsWith("//")) {
      lineComments++;
      const prefix = source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset);
      if (!prefix.trim()) comments[source.slice(0, offset).split("\n").length - 1] = token;
    } else blockComments++;
    return token.replace(/[^\r\n]/g, " ");
  });
  const lines = clean.split(/\r?\n/), production = readStorySourceLines(source);
  assert.deepEqual(production.lines, lines, `Comment/string tokenization differs: ${sourcePath}`);
  // Empty leading block comments may precede an actual region annotation.
  for (const [index, comment] of production.comments.entries()) if (comment) {
    assert(originalLines[index].endsWith(comment));
    assert(comment.startsWith("//") && !lines[index].trim());
  }
  for (const [index, comment] of comments.entries()) if (comment) assert.equal(production.comments[index], comment);
  const rules = [], lookup = createStoryRuleLookup(source), oldLookup = beforeRules.createStoryRuleLookup(source);
  let section = "header", current;
  const finish = (endLine) => { if (current) { current.endLine = endLine; rules.push(current); current = undefined; } };
  const sections = [];
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index].trim();
    const header = text.match(boundaryPattern);
    if (["INITSECTION", "KBSECTION", "EXITSECTION", "ENDEXITSECTION"].includes(text)) {
      finish(index); section = text === "INITSECTION" ? "init" : text === "KBSECTION" ? "kb" : "exit";
    } else if (section === "kb" && header) {
      finish(index); current = { kind: header[1], sourceLine: index + 1, actionLine: null, guards: header[2] ? [header[2]] : [] };
      if (originalLines[index].trim() !== header[1]) correctedHeaders++;
    } else if (current && text === "THEN") { assert.equal(current.actionLine, null, `Repeated THEN: ${sourcePath}:${index + 1}`); current.actionLine = index + 2; }
    else if (current && !current.actionLine && text) current.guards.push(text);
    sections[index] = section;
  }
  finish(lines.length);
  for (const rule of rules) {
    const actual = lookup(rule.sourceLine);
    for (const property of ["kind", "sourceLine", "actionLine", "endLine", "guards"]) assert.deepEqual(actual?.[property], rule[property], `${sourcePath}:${rule.sourceLine}/${property}`);
    checkedRules++;
  }
  const structural = clean.replace(/"(?:\\[\s\S]|[^"\\])*"/g, (token) => token.replace(/[^\r\n]/g, " "));
  const expected = [];
  for (const match of structural.matchAll(/(?:^|;)[ \t]*(?:(?:IF|IFF|PROC|QRY)[ \t]+)?(NOT\s+)?([A-Za-z0-9_]+)\s*\(/gm)) {
    const start = match.index + match[0].indexOf(match[1] ?? match[2]);
    const sourceLine = structural.slice(0, start).split("\n").length;
    let depth = 1, end = match.index + match[0].length;
    for (; end < structural.length && depth; end++) {
      if (structural[end] === "(") depth++;
      else if (structural[end] === ")") depth--;
    }
    assert.equal(depth, 0, `Unclosed native statement: ${sourcePath}:${sourceLine}`);
    const normalized = clean.slice(start, end).replace(/^NOT\s+/, "").replace(/"(?:\\[\s\S]|[^"\\])*"|\s+/g,
      (token) => token.startsWith('"') ? token : " ");
    expected.push({ predicate: match[2], section: sections[sourceLine - 1], negated: !!match[1], arguments: independentlySplit(normalized),
      evidence: { sourcePath, sourceLine, statement: normalized } });
  }
  for (const [key, fact] of indexed(expected)) {
    const actual = actualByKey.get(key), old = oldByKey.get(key);
    assert.deepEqual(actual, fact, `Native fact mismatch: ${key}`);
    actualByKey.delete(key); oldByKey.delete(key); independentlyRead++;
    if (!isDeepStrictEqual(old, fact)) deltas.push({ kind: old ? "corrected" : "recovered", before: old, after: fact });
    const currentRule = lookup(fact.evidence.sourceLine), previous = oldLookup(fact.evidence.sourceLine);
    if (!isDeepStrictEqual(currentRule, previous)) contextualChanges.push({ sourcePath, sourceLine: fact.evidence.sourceLine, predicate: fact.predicate, before: previous, after: currentRule });
  }
}
assert.equal(actualByKey.size, 0, "Production emitted facts not reconstructed from active native code");
for (const fact of oldByKey.values()) deltas.push({ kind: "discarded-inactive-or-malformed", before: fact });
assert.equal(independentlyRead, actualFacts.length);
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash);
const report = { kind: "native-story-reader-audit", errors: [],
  scope: "All exported goal/support files independently tokenized; every emitted fact and every rule boundary/guard reconstructed from active native code. Retains complete before/after deltas. Does not certify semantic correctness of downstream catalogs or game runtime behavior.",
  stats: { files: files.length, oldFacts: oldFacts.length, currentFacts: actualFacts.length, independentlyRead, checkedRules,
    correctedHeaders, blockComments, lineComments, recoveredFacts: deltas.filter(({ kind }) => kind === "recovered").length,
    correctedFacts: deltas.filter(({ kind }) => kind === "corrected").length, discardedFacts: oldByKey.size, contextualChanges: contextualChanges.length },
  deltas, contextualChanges, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
