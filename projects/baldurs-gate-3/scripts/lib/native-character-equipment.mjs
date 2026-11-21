import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createInventoryOwnerResolver } from "./inventory-item-profile.mjs";

// Resolve from exact source objects and native template inheritance. A false
// flag, empty equipment selection or conflicting export must not become true.
export const createNativeCharacterEquipmentResolver = ({ projectRoot, placementRoots, templates, members }) => {
  const objects = new Map(), hashes = {}, fields = new Map();
  const owner = createInventoryOwnerResolver(members);
  const relative = (file) => path.relative(projectRoot, file).split(path.sep).join("/");
  const load = (file) => {
    if (!objects.has(file)) {
      const bytes = fs.readFileSync(file);
      hashes[relative(file)] = createHash("sha256").update(bytes).digest("hex");
      const data = JSON.parse(bytes.toString("utf8")).save?.regions?.Templates?.GameObjects;
      if (!Array.isArray(data)) throw new Error(`Native equipment source has no objects: ${file}`);
      objects.set(file, new Map(data.map((object) => [object.MapKey?.value, object])));
    }
    return objects.get(file);
  };
  const localField = (object, field, file, objectId) => Object.hasOwn(object, field) && !Array.isArray(object[field])
    ? { value: object[field]?.value ?? (field === "Equipment" ? "" : undefined), sourcePath: relative(file), objectId, field } : undefined;
  const inherited = (id, field, stack = new Set()) => {
    if (!id) return undefined;
    const key = `${id}/${field}`;
    if (fields.has(key)) return fields.get(key);
    if (stack.has(id)) throw new Error(`Native equipment template cycle: ${key}`);
    const template = templates[id];
    if (!template) return undefined;
    const file = path.join(projectRoot, "map-sources/extracted/root-templates", template.provenance);
    const object = load(file).get(id);
    if (!object) throw new Error(`Native equipment template absent: ${id}`);
    const value = localField(object, field, file, id)
      ?? inherited(object.ParentTemplateId?.value, field, new Set([...stack, id]));
    fields.set(key, value);
    return value;
  };
  const inventoryReferences = (object, file, objectId) => (object.ItemList ?? []).flatMap((list) => list.Item ?? []).map((entry, index) => ({
    sourcePath: relative(file), objectId, index, itemName: entry.ItemName?.value ?? "",
    templateId: entry.TemplateID?.value?.toLowerCase() ?? "", itemObjectId: entry.UUID?.value ?? "",
    droppedOnDeath: entry.IsDroppedOnDeath?.value,
  }));
  // These are potential overlapping source references, not an assertion that
  // parent and local ItemLists are simultaneously present in the current scene.
  const templateInventory = (id, stack = new Set()) => {
    if (!id || !templates[id]) return [];
    if (stack.has(id)) throw new Error(`Template inventory cycle: ${id}`);
    const file = path.join(projectRoot, "map-sources/extracted/root-templates", templates[id].provenance);
    const object = load(file).get(id);
    if (!object) throw new Error(`Template inventory source absent: ${id}`);
    return [...inventoryReferences(object, file, id), ...templateInventory(object.ParentTemplateId?.value, new Set([...stack, id]))];
  };
  const resolve = (entity) => {
    const characterId = owner(entity), candidates = new Map();
    for (const { sourcePath } of entity.provenance ?? []) {
      if (!/\/Characters\//i.test(sourcePath)) continue;
      for (const root of placementRoots) {
        const file = path.join(root, sourcePath.replace(/^supplementary\//, ""));
        if (!fs.existsSync(file)) continue;
        const object = load(file).get(characterId);
        if (object) candidates.set(file, object);
      }
    }
    const resolved = {};
    for (const field of ["Equipment", "IsEquipmentLootable", "IsLootable"]) {
      const values = [...candidates].map(([file, object]) => localField(object, field, file, characterId)
        ?? inherited(object.TemplateName?.value, field)).filter(Boolean);
      const distinct = [...new Map(values.map((entry) => [JSON.stringify(entry.value), entry])).values()];
      if (distinct.length === 1) resolved[field] = distinct[0];
      else if (distinct.length > 1) resolved[field] = { conflict: distinct };
    }
    const inventory = [...candidates].flatMap(([file, object]) => [...inventoryReferences(object, file, characterId), ...templateInventory(object.TemplateName?.value)]);
    return { characterId, fields: resolved,
      inventoryReferences: [...new Map(inventory.map((entry) => [`${entry.sourcePath}/${entry.objectId}/${entry.index}`, entry])).values()],
      ...(candidates.size ? {} : { reason: "native-character-not-found" }) };
  };
  return { resolve, hashes };
};
