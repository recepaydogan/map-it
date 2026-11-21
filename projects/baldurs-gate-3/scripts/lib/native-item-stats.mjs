import fs from "node:fs";
import path from "node:path";

export const ITEM_MODULE_PRIORITY = new Map([
  ["Shared", 0], ["SharedDev", 1], ["Gustav", 2], ["GustavDev", 3], ["Honour", 4], ["GustavX", 5],
]);

export const listItemSourceFiles = (root, predicate) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (predicate(absolutePath)) files.push(absolutePath);
    }
  };
  visit(root);
  return files.sort((left, right) => {
    const leftModule = [...ITEM_MODULE_PRIORITY.keys()].find((module) => left.includes(`${path.sep}${module}${path.sep}`));
    const rightModule = [...ITEM_MODULE_PRIORITY.keys()].find((module) => right.includes(`${path.sep}${module}${path.sep}`));
    return (ITEM_MODULE_PRIORITY.get(leftModule) ?? 99) - (ITEM_MODULE_PRIORITY.get(rightModule) ?? 99)
      || left.localeCompare(right, "en");
  });
};

export const isItemStatFile = (file) => /(?:Armor|Object|Weapon|Passive|Spell_[^/\\]+)\.txt$/i.test(file);

const unescapeValue = (value) => value.replaceAll('\\"', '"').replaceAll("\\n", "\n").replaceAll("\\\\", "\\");
const parseStatFile = (filePath, projectRoot) => {
  const entries = [];
  let current;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const entry = line.match(/^new entry "((?:\\"|[^"])*)"/);
    if (entry) {
      if (current) entries.push(current);
      current = { id: unescapeValue(entry[1]), type: "", parent: "", data: {},
        provenance: path.relative(projectRoot, filePath).split(path.sep).join("/") };
      continue;
    }
    if (!current) continue;
    const type = line.match(/^type "((?:\\"|[^"])*)"/);
    const parent = line.match(/^using "((?:\\"|[^"])*)"/);
    const data = line.match(/^data "((?:\\"|[^"])*)" "((?:\\"|[^"])*)"/);
    if (type) current.type = unescapeValue(type[1]);
    else if (parent) current.parent = unescapeValue(parent[1]);
    else if (data) current.data[unescapeValue(data[1])] = unescapeValue(data[2]);
  }
  if (current) entries.push(current);
  return entries;
};

// Both item metadata and equipment generation need the same module ordering,
// self-parent overrides and inherited RootTemplate/ItemGroup identity.
export const readResolvedItemStats = (files, projectRoot) => {
  const raw = new Map();
  for (const file of files) for (const entry of parseStatFile(file, projectRoot)) {
    const previous = raw.get(entry.id);
    raw.set(entry.id, entry.parent === entry.id && previous
      ? { ...entry, parent: previous.parent, data: { ...previous.data, ...entry.data } } : entry);
  }
  const resolved = new Map(), resolving = new Set();
  const resolve = (id) => {
    if (resolved.has(id)) return resolved.get(id);
    const entry = raw.get(id);
    if (!entry) return null;
    if (resolving.has(id)) throw new Error(`Stat inheritance cycle at ${id}.`);
    resolving.add(id);
    const parent = entry.parent ? resolve(entry.parent) : null;
    const result = { id: entry.id, type: entry.type || parent?.type || "", parent: entry.parent || undefined,
      data: { ...(parent?.data ?? {}), ...entry.data },
      declaredRootTemplate: Object.hasOwn(entry.data, "RootTemplate"), provenance: entry.provenance };
    resolving.delete(id);
    resolved.set(id, result);
    return result;
  };
  for (const id of raw.keys()) resolve(id);
  return resolved;
};
