import fs from "node:fs";
import path from "node:path";

// Preserve every level/root/name row. Only a universal, unchanged single-root
// group can establish a fixed identity; other progression remains reviewable.
export const readItemProgression = (files, projectRoot) => {
  const groups = new Map();
  for (const file of files) {
    let group, level, root;
    for (const [index, source] of fs.readFileSync(file, "utf8").split(/\r?\n/).entries()) {
      const line = source.trim();
      if (!line || line.startsWith("//")) continue;
      const start = line.match(/^new itemgroup "([^"]+)"$/);
      if (start) {
        if (groups.has(start[1])) throw new Error(`Duplicate progression group ${start[1]} in ${file}`);
        group = { id: start[1], sourcePath: path.relative(projectRoot, file).replaceAll("\\", "/"), sourceLine: index + 1, levels: [] };
        groups.set(group.id, group);
        level = root = undefined;
        continue;
      }
      const levelRow = line.match(/^add levelgroup (\d+),(\d+),"([^"]+)"$/);
      if (group && levelRow) {
        level = { minimumLevel: Number(levelRow[1]), maximumLevel: Number(levelRow[2]), rarity: levelRow[3], roots: [] };
        group.levels.push(level);
        root = undefined;
        continue;
      }
      const rootRow = line.match(/^add rootgroup "([0-9a-f-]{36})","([^"]*)"$/i);
      if (level && rootRow) {
        root = { rootTemplateId: rootRow[1].toLowerCase(), color: rootRow[2], names: [] };
        level.roots.push(root);
        continue;
      }
      const nameRow = line.match(/^add namegroup "([^"]*)","([^"]*)","([^"]*)"$/);
      if (root && nameRow) {
        root.names.push({ nameGroup: nameRow[1], affix: nameRow[2], icon: nameRow[3] });
        continue;
      }
      throw new Error(`Unsupported item progression row at ${file}:${index + 1}: ${line}`);
    }
  }
  return groups;
};

export const hasMatchingFixedProgression = (group, rootTemplateId) => {
  if (group?.levels.length !== 1) return false;
  const level = group.levels[0];
  if (level.minimumLevel !== 0 || level.maximumLevel !== 0 || level.rarity !== "All" || level.roots.length !== 1) return false;
  const root = level.roots[0];
  return root.rootTemplateId === rootTemplateId && !root.color
    && root.names.length === 1 && !root.names[0].affix && !root.names[0].icon;
};
