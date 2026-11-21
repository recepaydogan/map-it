import fs from "node:fs";
import path from "node:path";
import { readNativeInventoryCondition } from "./native-inventory-condition.mjs";

const value = (attribute) => attribute?.value ?? attribute?.handle;
const files = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const filename = path.join(directory, entry.name);
  return entry.isDirectory() ? files(filename) : filename.endsWith(".lsj") ? [filename] : [];
});
const treasureIds = (input, output = []) => {
  if (Array.isArray(input)) input.forEach((item) => treasureIds(item, output));
  else if (input && typeof input === "object") for (const [key, child] of Object.entries(input)) {
    if (key === "value" && typeof child === "string" && child && child !== "FixedString") output.push(child);
    else treasureIds(child, output);
  }
  return output;
};

// Keep authored inventory references separate from the referenced object's
// current template: ItemList.TemplateID can predate a placed-object override.
export const readNativeItemPlacements = ({ roots, projectRoot, localization, templateHandle, templateValue = () => undefined }) => {
  const objects = new Map(), statOverrides = new Map(), identityOverrides = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const filename of files(root)) {
      const document = JSON.parse(fs.readFileSync(filename, "utf8"));
      const sourcePath = path.relative(projectRoot, filename).replaceAll("\\", "/");
      for (const object of document.save?.regions?.Templates?.GameObjects ?? []) {
        const id = value(object.MapKey);
        if (!id) continue;
        const templateId = value(object.TemplateName)?.toLowerCase(), statsId = value(object.Stats);
        if (templateId && statsId) {
          const key = `${templateId}\u0000${statsId}`;
          if (!statOverrides.has(key)) statOverrides.set(key, { templateId, statsId, sourceObjectId: id, sourcePath });
        }
        if (objects.has(id)) continue;
        if (templateId && object.DisplayName?.handle && object.DisplayName.handle !== templateHandle(templateId, "DisplayName")) {
          identityOverrides.push({ templateId, statsId, sourceObjectId: id, sourcePath,
            attributes: Object.fromEntries(["DisplayName", "Description", "Icon"].filter((key) => Object.hasOwn(object, key))
              .map((key) => [key, object[key]])) });
        }
        const handle = object.DisplayName?.handle || templateHandle(templateId, "DisplayName");
        objects.set(id, {
          id, templateId, statsId, sourcePath,
          // Empty Equipment and false lootability explicitly clear inherited
          // defaults. Neither may fall back via truthiness or become ItemList.
          equipmentId: Object.hasOwn(object, "Equipment") && !Array.isArray(object.Equipment)
            ? value(object.Equipment) ?? "" : templateValue(templateId, "Equipment"),
          equipmentLootable: Object.hasOwn(object, "IsEquipmentLootable")
            ? value(object.IsEquipmentLootable) : templateValue(templateId, "IsEquipmentLootable"),
          lootable: Object.hasOwn(object, "IsLootable")
            ? value(object.IsLootable) : templateValue(templateId, "IsLootable"),
          ownerKind: filename.split(path.sep).some((segment) => segment.toLowerCase() === "characters") ? "character" : "container",
          displayName: Object.fromEntries(Object.entries({ en: localization.en.get(handle), tr: localization.tr.get(handle) })
            .filter(([, text]) => text)),
          tradeTables: [...new Set(treasureIds(object.TradeTreasures))],
          treasureTables: [...new Set(treasureIds(object.Treasures))],
          inventory: (object.ItemList ?? []).flatMap((inventory) => inventory.Item ?? []).map((entry) => ({
            objectId: value(entry.UUID), templateId: value(entry.TemplateID)?.toLowerCase(), itemName: value(entry.ItemName),
            amount: Number(value(entry.Amount)) || 1,
            droppedOnDeath: value(entry.IsDroppedOnDeath) === true,
            pickpocketable: value(entry.CanBePickpocketed) === true,
            tradeable: (value(entry.IsTradeable) ?? value(entry.IsTradable)) === true,
            ...readNativeInventoryCondition(entry),
            difficulties: [["explorer", "CasualExplorer"], ["balanced", "Classic"], ["tactician", "TacticianHardcore"], ["honour", "HonorHardcore"]]
              .filter(([, field]) => value(entry[field]) === true).map(([difficulty]) => difficulty),
          })),
        });
      }
    }
  }
  return { objects, statOverrides: [...statOverrides.values()], identityOverrides };
};
