import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length < 7) throw new Error("Usage: build-dialog-resource-catalog.mjs <banks-root> <dialogs-root> <output> <package> [package...]");
const [banksRoot, dialogsRoot, output, ...packages] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, packageInventories = [], nativeFiles = new Set(), nativeBanks = new Set();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const read = (file) => {
  const bytes = fs.readFileSync(file), key = relative(file), hash = digest(bytes);
  assert(!hashes[key] || hashes[key] === hash, `Changed native input: ${key}`);
  hashes[key] = hash; return JSON.parse(bytes);
};
const extractor = path.join(root, "tools/package-resource-extract/bin/Debug/net8.0/package-resource-extract.exe");
for (const file of packages) {
  const process = spawnSync(extractor, [file, "--list-name-contains", "/Dialogs/"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (process.error) throw process.error;
  assert(process.status === 0 || process.status === 3, `Native package listing failed: ${file}\n${process.stderr}`);
  if (process.status === 3) assert(!process.stdout.trim() && process.stderr.trim() === "Matched 0 resources containing /Dialogs/.", "Unrecognized empty package result");
  const listing = process.stdout;
  const resources = listing.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("Matched "));
  for (const resource of resources) {
    nativeFiles.add(resource.toLowerCase());
    if (/^Public\/[^/]+\/Content\/Assets\/Dialogs\/.+\.lsf$/i.test(resource)) nativeBanks.add(resource.toLowerCase());
  }
  const stat = fs.statSync(file);
  packageInventories.push({ packagePath: file, size: stat.size, modifiedAt: stat.mtime.toISOString(), resources: resources.length, listingSha256: digest(JSON.stringify(resources)) });
}
const files = fs.readdirSync(banksRoot, { recursive: true }).filter((file) => file.endsWith(".lsj")).sort();
const extractedBanks = files.map((file) => {
  const [module, ...suffix] = file.split(path.sep);
  return `Public/${module}/Content/Assets/Dialogs/${suffix.join("/").replace(/\.lsj$/, ".lsf")}`.toLowerCase();
});
assert.deepEqual([...extractedBanks].sort(), [...nativeBanks].sort(), "Native bank inventory differs from extracted sources");
const declarations = new Map();
for (const file of files) {
  const sourcePath = path.join(banksRoot, file), bank = read(sourcePath).save?.regions?.DialogBank;
  assert(Array.isArray(bank?.Resource), `Missing DialogBank: ${file}`);
  for (const [index, resource] of bank.Resource.entries()) {
    const id = resource.ID?.value?.toLowerCase(), source = resource.SourceFile?.value;
    assert(id && typeof source === "string", `Incomplete dialog resource: ${file}/${index}`);
    const entries = declarations.get(id) ?? [];
    entries.push({ resourceId: id, nativeDialogPath: source.replaceAll("\\", "/"), name: resource.Name?.value,
      bankSource: relative(sourcePath), resourceIndex: index });
    declarations.set(id, entries);
  }
}
const bindings = {}, byDialogId = {}, unresolved = [], documents = new Map();
for (const [resourceId, entries] of [...declarations].sort(([left], [right]) => left.localeCompare(right, "en"))) {
  const paths = [...new Set(entries.map(({ nativeDialogPath }) => nativeDialogPath))];
  if (paths.length !== 1) { unresolved.push({ resourceId, reason: "conflicting-native-resources", entries }); continue; }
  const nativeDialogPath = paths[0];
  if (!nativeDialogPath) { unresolved.push({ resourceId, reason: "empty-native-source", entries }); continue; }
  const match = nativeDialogPath.match(/^Mods\/([^/]+)\/Story\/Dialogs\/(.+\.lsj)$/i);
  assert(match, `Unsupported dialog source path: ${nativeDialogPath}`);
  const sourcePath = path.resolve(dialogsRoot, match[1], match[2]), within = path.relative(dialogsRoot, sourcePath);
  assert(within && !within.startsWith("..") && !path.isAbsolute(within), "Dialog source escapes extraction root");
  if (!nativeFiles.has(nativeDialogPath.toLowerCase())) {
    unresolved.push({ resourceId, reason: "source-absent-from-installed-packages", extractedSourcePresent: fs.existsSync(sourcePath), entries });
    continue;
  }
  if (!fs.existsSync(sourcePath)) {
    unresolved.push({ resourceId, reason: "native-dialog-not-extracted", entries });
    continue;
  }
  if (!documents.has(sourcePath)) documents.set(sourcePath, read(sourcePath));
  const dialogId = documents.get(sourcePath).save?.regions?.dialog?.UUID?.value?.toLowerCase();
  assert(dialogId, `Missing internal dialog identity: ${nativeDialogPath}`);
  bindings[resourceId] = { resourceId, dialogId, nativeDialogPath, module: match[1], dialogSource: relative(sourcePath), declarations: entries };
  (byDialogId[dialogId] ??= []).push(resourceId);
}
for (const ids of Object.values(byDialogId)) ids.sort();
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const report = { schemaVersion: 1, kind: "native-dialog-resource-bindings", inputs: { banksRoot: relative(banksRoot), dialogsRoot: relative(dialogsRoot), packageInventories },
  stats: { banks: files.length, declarations: [...declarations.values()].reduce((sum, entries) => sum + entries.length, 0), resources: declarations.size,
    bindings: Object.keys(bindings).length, distinctDialogs: Object.keys(byDialogId).length, differentIdentities: Object.values(bindings).filter(({ resourceId, dialogId }) => resourceId !== dialogId).length,
    unresolved: unresolved.length, unresolvedByReason: Object.fromEntries(Object.entries(Object.groupBy(unresolved, ({ reason }) => reason)).map(([reason, entries]) => [reason, entries.length])) },
  bindings, byDialogId, unresolved, hashes,
  scope: "Exact installed native resource-bank path to extracted internal dialog UUID. No filename guessing, ambiguous module override selection, missing-source substitution, runtime tests or publication." };
fs.mkdirSync(path.dirname(output), { recursive: true }); writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
