import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Reconstruct all bindings from native resources without importing the builder.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 7) throw new Error("Usage: audit-dialog-resource-bindings.mjs <bindings> <dialog-catalog> <story-catalog> <map-stage> <report>");
const [input, dialogsPath, storyPath, stageRoot, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const bytes = (file) => {
  const value = fs.readFileSync(file), key = relative(file);
  assert(!hashes[key] || hashes[key] === digest(value), `Changed input: ${key}`);
  hashes[key] = digest(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const catalog = read(input), dialogs = read(dialogsPath), story = read(storyPath), manifest = read(path.join(stageRoot, "stage-manifest.json"));
assert.equal(catalog.kind, "native-dialog-resource-bindings");
for (const [file, expected] of Object.entries(catalog.hashes)) assert.equal(digest(bytes(path.resolve(root, file))), expected);
const files = new Set(), bankFiles = new Set();
for (const source of catalog.inputs.packageInventories) {
  const stat = fs.statSync(source.packagePath); assert.equal(stat.size, source.size); assert.equal(stat.mtime.toISOString(), source.modifiedAt);
  const process = spawnSync(path.join(root, "tools/package-resource-extract/bin/Debug/net8.0/package-resource-extract.exe"),
    [source.packagePath, "--list-name-contains", "/Dialogs/"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (process.error) throw process.error;
  assert(process.status === 0 || process.status === 3);
  if (process.status === 3) assert.equal(`${process.stdout.trim()}${process.stderr.trim()}`, "Matched 0 resources containing /Dialogs/.");
  const listing = process.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("Matched "));
  assert.equal(listing.length, source.resources); assert.equal(digest(JSON.stringify(listing)), source.listingSha256);
  for (const name of listing) {
    files.add(name.toLowerCase());
    if (/^Public\/[^/]+\/Content\/Assets\/Dialogs\/.+\.lsf$/i.test(name)) bankFiles.add(name.toLowerCase());
  }
}
const declarations = new Map(), banksRoot = path.resolve(root, catalog.inputs.banksRoot), dialogsRoot = path.resolve(root, catalog.inputs.dialogsRoot);
const exportedBanks = fs.readdirSync(banksRoot, { recursive: true }).filter((file) => file.endsWith(".lsj"));
assert.equal(exportedBanks.length, bankFiles.size);
for (const name of exportedBanks) {
  const parts = name.split(path.sep), module = parts.shift();
  assert(bankFiles.delete(`Public/${module}/Content/Assets/Dialogs/${parts.join("/").replace(/\.lsj$/, ".lsf")}`.toLowerCase()));
  const file = path.join(banksRoot, name), source = read(file).save.regions.DialogBank.Resource;
  for (const [index, entry] of source.entries()) {
    const resourceId = entry.ID.value.toLowerCase(), values = declarations.get(resourceId) ?? [];
    values.push({ resourceId, nativeDialogPath: entry.SourceFile.value.replaceAll("\\", "/"), name: entry.Name?.value, bankSource: relative(file), resourceIndex: index });
    declarations.set(resourceId, values);
  }
}
assert.equal(bankFiles.size, 0);
const unresolved = new Map(catalog.unresolved.map((entry) => [entry.resourceId, entry]));
assert.equal(unresolved.size, catalog.unresolved.length);
assert.deepEqual([...declarations.keys()].sort(), [...Object.keys(catalog.bindings), ...unresolved.keys()].sort());
const byDialogId = {};
for (const [id, entries] of declarations) {
  const binding = catalog.bindings[id], issue = unresolved.get(id), names = [...new Set(entries.map((entry) => entry.nativeDialogPath))];
  assert.deepEqual((binding?.declarations ?? issue.entries).toSorted((a, b) => a.bankSource.localeCompare(b.bankSource)), entries.toSorted((a, b) => a.bankSource.localeCompare(b.bankSource)));
  if (issue) {
    if (issue.reason === "conflicting-native-resources") assert(names.length > 1);
    else if (issue.reason === "empty-native-source") assert.deepEqual(names, [""]);
    else {
      assert.equal(names.length, 1);
      if (issue.reason === "source-absent-from-installed-packages") assert(!files.has(names[0].toLowerCase()));
      else { assert.equal(issue.reason, "native-dialog-not-extracted"); assert(files.has(names[0].toLowerCase())); }
    }
    continue;
  }
  assert.deepEqual(names, [binding.nativeDialogPath]); assert(files.has(names[0].toLowerCase()));
  const parts = names[0].split("/"); assert.equal(parts[0], "Mods"); assert.equal(parts[2], "Story"); assert.equal(parts[3], "Dialogs");
  const sourcePath = path.join(dialogsRoot, parts[1], ...parts.slice(4));
  assert.equal(relative(sourcePath), binding.dialogSource); assert.equal(binding.module, parts[1]);
  assert.equal(read(sourcePath).save.regions.dialog.UUID.value.toLowerCase(), binding.dialogId);
  (byDialogId[binding.dialogId] ??= []).push(id);
}
for (const ids of Object.values(byDialogId)) ids.sort();
assert.deepEqual(catalog.byDialogId, byDialogId);
const catalogCoverage = [], unboundCatalogDialogs = [];
for (const dialog of Object.values(dialogs.dialogs)) {
  const expectedPath = `Mods/${dialog.module}/Story/Dialogs/${dialog.provenance}`;
  const resources = (byDialogId[dialog.id] ?? []).filter((id) => catalog.bindings[id].nativeDialogPath === expectedPath);
  if (resources.length) catalogCoverage.push({ dialogId: dialog.id, resourceIds: resources });
  else unboundCatalogDialogs.push({ dialogId: dialog.id, nativeDialogPath: expectedPath });
}
const moneyCoverage = story.dialogMoneyTransfers.map((transfer) => {
  const binding = catalog.bindings[transfer.dialog.id];
  return { id: transfer.id, resourceId: transfer.dialog.id, amount: transfer.amount, ...(binding ? { dialogId: binding.dialogId, nativeDialogPath: binding.nativeDialogPath,
    inDialogueCatalog: Boolean(dialogs.dialogs[binding.dialogId]) } : { unresolvedReason: unresolved.get(transfer.dialog.id)?.reason ?? "no-native-resource" }) };
});
let mapAppearances = 0, generatedMoneyProfiles = 0;
for (const mapId of manifest.maps) for (const entity of read(path.join(stageRoot, "public/maps", mapId, "content.json")).entities) {
  mapAppearances++;
  if (Object.values(entity).some((value) => value && typeof value === "object" && Object.hasOwn(value, "moneyTransfers"))) generatedMoneyProfiles++;
}
for (const file of [import.meta.filename, "scripts/build-dialog-resource-catalog.mjs", "scripts/build-placement-catalog.mjs"]) bytes(path.resolve(root, file));
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const report = { kind: "native-dialog-resource-binding-audit", errors: [], catalogPath: input, dialogsPath, storyPath, stageRoot,
  stats: { ...catalog.stats, catalogDialogs: Object.keys(dialogs.dialogs).length, boundCatalogDialogs: catalogCoverage.length, unboundCatalogDialogs: unboundCatalogDialogs.length,
    moneyDeclarations: moneyCoverage.length, boundMoneyDeclarations: moneyCoverage.filter((entry) => entry.dialogId).length,
    catalogMoneyDeclarations: moneyCoverage.filter((entry) => entry.inDialogueCatalog).length, mapAppearances, generatedMoneyProfiles },
  catalogCoverage, unboundCatalogDialogs, moneyCoverage, unresolved: catalog.unresolved, hashes,
  scope: "Full extracted native bank/internal-UUID mapping and installed package-name inventory independently reconstructed. Ambiguous and absent resources remain explicit. Current map dialogue presentation is disabled; this report neither re-enables it nor certifies money direction, branch conditions, runtime module precedence, all content coverage or publication." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.stats, null, 2));
