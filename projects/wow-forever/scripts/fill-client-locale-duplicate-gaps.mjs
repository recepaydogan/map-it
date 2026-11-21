/** Reuse matching client translations for empty fields and repeated English item or spell text. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "public/data/locales/wow-forever");
const source = JSON.parse(await readFile(join(directory, "source.json"), "utf8"));
const mapEntitySource = JSON.parse(await readFile(join(directory, "map-entity-source.json"), "utf8"));
const itemCatalog = JSON.parse(await readFile(join(root, "public/data/items/catalog.json"), "utf8"));
const authoredClientText = JSON.parse(await readFile(join(root,
  "data/item-name-localization/reviewed-client-english-gaps.json"), "utf8"));
const reviewedSpanishGaps = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-spanish-cross-region-gaps.json"), "utf8"));
const reviewedChineseTeachingText = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-zh-cn-teaching-text.json"), "utf8"));
const reviewedChineseAmbiguousTeachingText = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-zh-cn-ambiguous-teaching-text.json"), "utf8"));
const reviewedChineseOtherTeachingText = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-zh-cn-other-teaching-text.json"), "utf8"));
const reviewedPortugueseTeachingText = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-pt-br-teaching-text.json"), "utf8"));
const reviewedFrenchPotion = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-fr-predatory-senses.json"), "utf8"));
const reviewedFrenchTalents = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-fr-talent-names.json"), "utf8"));
const reviewedFrenchRenamedItems = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-fr-renamed-item-names.json"), "utf8"));
const reviewedGermanTravel = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-de-travel-spells.json"), "utf8"));
const reviewedSharedDescriptions = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-shared-item-description-gaps.json"), "utf8"));
const reviewedLegacyFlavor = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-legacy-item-flavor.json"), "utf8"));
const reviewedChineseLegacy = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-zh-legacy-descriptions.json"), "utf8"));
const reviewedConsumableNames = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-shared-consumable-names.json"), "utf8"));
const reviewedDeprecatedNames = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-deprecated-item-names.json"), "utf8"));
const reviewedChineseItemNames = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-zh-cn-item-name-gaps.json"), "utf8"));
const reviewedTraditionalItemNames = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-zh-tw-item-name-gaps.json"), "utf8"));
const reviewedVisibleItemGaps = JSON.parse(await readFile(join(root,
  "data/client-locale-localization/reviewed-visible-item-gaps.json"), "utf8"));
const indexByKey = new Map(source.keys.map((key, index) => [key, index]));
const mapEntityIndexByKey = new Map(mapEntitySource.keys.map((key, index) => [key, index]));
const duplicates = {
  "SpellName:88163:0": "SpellName:6603:0",
  "SpellName:1320332:0": "SpellName:1320330:0",
  "SpellName:1320580:0": "SpellName:1320579:0",
  "ChrClasses:2:17": "ChrClasses:5:1",
  "ChrRaces:4:18": "ChrRaces:29:1",
  "ChrRaces:95:16": "ChrRaces:11:10",
  "AreaPOI:8771:13": "AreaPOI:1247:0",
};
const esESItemsWithEsMXClientText = [
  "ItemSparse:12533:4",
  "ItemSparse:12736:4",
  "ItemSparse:20378:4",
];
const reviewedVariant = {
  esMX: { "ItemSparse:208753:0": "ItemSparse:203748:0" },
};
const reviewedItemSpellNames = {
  esES: {
    12284: { spellId: 16007, category: "Quest" },
    19141: { spellId: 23595, category: "Armor · Miscellaneous" },
    15293: { spellId: 18992, category: "Miscellaneous · Mount" },
  },
  zhCN: {
    5105: { spellId: 1228165, category: "Miscellaneous · Junk" },
  },
};
const reviewedSpellItemNames = {
  29055: { itemId: 23172, category: "Consumable · Food & Drink" },
  30175: { itemId: 23719, category: "Consumable · Other", locales: ["koKR"] },
  1326057: { itemId: 5509, category: "Consumable · Other", locales: ["frFR"] },
};
const reviewedPermanentChineseItems = {
  23715: { baseId: 8411, spellId: 30164 },
  23719: { baseId: 8423, spellId: 30175 },
  23721: { baseId: 8424, spellId: 30177 },
  23722: { baseId: 8410, spellId: 30178 },
  23794: { baseId: 20080, spellId: 30331 },
  23795: { baseId: 20079, spellId: 30336 },
  23796: { baseId: 20081, spellId: 30338 },
};
const reviewedChineseFirstVolumeBooks = {
  1111: 1676,
  3134: 5720,
  3143: 3144,
  5696: 3126,
};
const reviewedNumberlessSpellNames = {
  zhCN: { "Increased 1H Sword": "单手剑技能提高" },
};
const enchantItemsWithNativeSpells = {
  273589: [27837], 273608: [1231139], 273610: [1232172],
  273538: [13937, 13938], 273515: [13695], 273489: [13529],
  273474: [7793], 273481: [13380], 273568: [20036],
  273567: [20035], 273465: [7745], 273562: [20030],
};
if (source.version !== 1 || source.keys.length !== source.values.length) {
  throw new Error("Invalid client locale source");
}
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const localizedFormulaPrefixes = {
  deDE: "Formel: ", esES: "Fórmula: ", esMX: "Fórmula: ",
  frFR: "Formule : ", koKR: "주문식: ", ptBR: "Fórmula: ",
  zhCN: "公式：", zhTW: "公式：",
};
const localizedSchematicPrefixes = {
  deDE: "Bauplan: ", esES: "Esquema: ", esMX: "Esquema: ",
  frFR: "Schéma : ", koKR: "설계도: ", ptBR: "Diagrama: ",
  zhCN: "结构图：", zhTW: "結構圖：",
};
const englishRelatedName = (name) => name.replace(/^(?:Formula|Schematic): /, "");
const localizedRelatedName = (record, locale) => {
  const name = record.translations[locale].name;
  const prefix = record.name.startsWith("Formula: ") ? localizedFormulaPrefixes[locale]
    : record.name.startsWith("Schematic: ") ? localizedSchematicPrefixes[locale] : "";
  if (!name.startsWith(prefix)) {
    throw new Error(`${record.name}/${locale}: localized recipe prefix differs`);
  }
  return name.slice(prefix.length);
};
const catalogItems = new Map(itemCatalog.items.map((item) => [item.id, item]));
if (reviewedVisibleItemGaps.version !== 1 || !reviewedVisibleItemGaps.items) {
  throw new Error("Invalid reviewed visible item gap catalog");
}
for (const [id, record] of Object.entries(reviewedVisibleItemGaps.items)) {
  if (!/^\d+$/.test(id) || !record.context ||
    catalogItems.get(id)?.name !== record.name ||
    source.values[indexByKey.get(`ItemSparse:${id}:4`)] !== record.name ||
    !Object.keys(record.fields ?? {}).length) {
    throw new Error(`${id}: reviewed visible item identity changed`);
  }
  for (const [field, entry] of Object.entries(record.fields)) {
    const index = indexByKey.get(`ItemSparse:${id}:${field}`);
    if (!["0", "4"].includes(field) || index === undefined ||
      source.values[index] !== entry.english ||
      (field === "0" && catalogItems.get(id)?.description !== entry.english) ||
      !Object.keys(entry.translations ?? {}).length ||
      Object.entries(entry.translations).some(([locale, translation]) =>
        !locales.includes(locale) || !translation.text?.trim() ||
        translation.text === (translation.current ?? entry.english) ||
        (translation.referenceLocale && translation.referenceLocale !== "esES"))) {
      throw new Error(`${id}/${field}: reviewed visible item field changed`);
    }
  }
}
for (const [id, spellIds] of Object.entries(enchantItemsWithNativeSpells)) {
  const item = catalogItems.get(id);
  const name = source.values[indexByKey.get(`ItemSparse:${id}:4`)];
  if (item?.name !== name || !item.category.startsWith("Consumable · Item Enhancement") ||
    !name.startsWith("Enchant 2H Weapon - ") ||
    spellIds.some((spellId) => source.values[indexByKey.get(`SpellName:${spellId}:0`)] !== name)) {
    throw new Error(`${id}: reviewed enchant item/spell identity changed`);
  }
}
if (authoredClientText.version !== 1 || !authoredClientText.items) {
  throw new Error("Invalid authored client text catalog");
}
for (const [id, record] of Object.entries(authoredClientText.items)) {
  const item = catalogItems.get(id);
  if (!item || item.name !== record.name ||
    (record.description !== undefined && item.description !== record.description) ||
    !record.context || Object.keys(record.translations ?? {}).length !== locales.length ||
    locales.some((locale) => !record.translations[locale])) {
    throw new Error(`${id}: invalid authored client item`);
  }
  const fields = [[4, record.name], ...(record.description === undefined
    ? [] : [[0, record.description]])];
  for (const [field, english] of fields) {
    const index = indexByKey.get(`ItemSparse:${id}:${field}`);
    if (index === undefined || source.values[index] !== english || !english) {
      throw new Error(`${id}: authored client source changed`);
    }
  }
  if (record.nameReferenceKey &&
    (indexByKey.get(record.nameReferenceKey) === undefined ||
      !record.referenceNames ||
      Object.keys(record.referenceNames).length !== locales.length)) {
    throw new Error(`${id}: invalid client name reference`);
  }
  for (const [table, ids] of [["ItemSparse", record.relatedItemIds ?? []],
    ["SpellName", record.relatedSpellIds ?? []]]) {
    for (const relatedId of ids) {
      const key = `${table}:${relatedId}:${table === "ItemSparse" ? 4 : 0}`;
      const index = indexByKey.get(key);
      if (index === undefined || source.values[index] !== englishRelatedName(record.name) ||
        (table === "ItemSparse" &&
          catalogItems.get(String(relatedId))?.name !== source.values[index])) {
        throw new Error(`${id}: related item or spell differs from formula: ${key}`);
      }
    }
  }
  for (const locale of locales) for (const field of record.description === undefined
    ? ["name"] : ["name", "description"]) {
    const value = record.translations[locale][field];
    if (typeof value !== "string" || !value.trim() || value === record[field]) {
      throw new Error(`${id}/${locale}: missing authored client translation`);
    }
  }
}
for (const [target, reference] of Object.entries(duplicates)) {
  const targetIndex = indexByKey.get(target);
  const referenceIndex = indexByKey.get(reference);
  if (targetIndex === undefined || referenceIndex === undefined
    || source.values[targetIndex] !== source.values[referenceIndex]) {
    throw new Error(`Client source no longer matches: ${target} / ${reference}`);
  }
}
const itemDescriptionGroups = new Map();
const itemNameGroups = new Map();
const areaNameGroups = new Map();
const spellNameGroups = new Map();
const numberSignature = (value) => (value.match(/\d+(?:[.,]\d+)*/g) ?? []).join("|");
for (const [index, key] of source.keys.entries()) {
  if (!source.values[index]) continue;
  const english = source.values[index];
  const groups = /^ItemSparse:\d+:0$/.test(key) ? itemDescriptionGroups
    : /^ItemSparse:\d+:4$/.test(key) && !english.startsWith("Monster - ")
      ? itemNameGroups : /^AreaTable:\d+:1$/.test(key) ? areaNameGroups
        : /^SpellName:\d+:0$/.test(key) ? spellNameGroups : undefined;
  if (!groups) continue;
  const indexes = groups.get(english) ?? [];
  indexes.push(index);
  groups.set(english, indexes);
}
for (const variants of Object.values(reviewedVariant)) for (const [target, reference] of Object.entries(variants)) {
  const targetIndex = indexByKey.get(target);
  const referenceIndex = indexByKey.get(reference);
  if (targetIndex === undefined || referenceIndex === undefined ||
    source.values[targetIndex] !== source.values[referenceIndex]) {
    throw new Error(`Client description source no longer matches: ${target} / ${reference}`);
  }
}
const check = process.argv.includes("--check");
const provenancePath = join(directory, "provenance.json");
const provenanceRaw = await readFile(provenancePath, "utf8");
const provenance = JSON.parse(provenanceRaw);
const mexicanSpanish = JSON.parse(await readFile(join(directory, "esMX.json"), "utf8"));
const europeanSpanish = JSON.parse(await readFile(join(directory, "esES.json"), "utf8"));
const simplifiedChinese = JSON.parse(await readFile(join(directory, "zhCN.json"), "utf8"));
const traditionalChinese = JSON.parse(await readFile(join(directory, "zhTW.json"), "utf8"));
if (mexicanSpanish.version !== 1 || mexicanSpanish.values.length !== source.keys.length ||
  europeanSpanish.version !== 1 || europeanSpanish.values.length !== source.keys.length ||
  reviewedSpanishGaps.version !== 1 ||
  Object.keys(reviewedSpanishGaps.entries ?? {}).sort().join() !== "esES,esMX") {
  throw new Error("Invalid Spanish client locale source or reviewed gap catalog");
}
if (simplifiedChinese.version !== 1 || simplifiedChinese.values.length !== source.keys.length ||
  traditionalChinese.version !== 1 || traditionalChinese.values.length !== source.keys.length ||
  reviewedChineseTeachingText.version !== 1 ||
  !reviewedChineseTeachingText.context ||
  !Object.keys(reviewedChineseTeachingText.entries ?? {}).length ||
  reviewedChineseAmbiguousTeachingText.version !== 1 ||
  !reviewedChineseAmbiguousTeachingText.context ||
  !Object.keys(reviewedChineseAmbiguousTeachingText.entries ?? {}).length ||
  reviewedChineseOtherTeachingText.version !== 1 ||
  !reviewedChineseOtherTeachingText.context ||
  !Object.keys(reviewedChineseOtherTeachingText.entries ?? {}).length ||
  reviewedPortugueseTeachingText.version !== 1 ||
  !reviewedPortugueseTeachingText.context ||
  !reviewedPortugueseTeachingText.tailoringIds?.length ||
  !Object.keys(reviewedPortugueseTeachingText.spellEntries ?? {}).length ||
  !Object.keys(reviewedPortugueseTeachingText.craftEntries ?? {}).length ||
  !Object.keys(reviewedPortugueseTeachingText.spellCraftEntries ?? {}).length ||
  reviewedFrenchPotion.version !== 1 || !reviewedFrenchPotion.context ||
  reviewedFrenchPotion.spellIds?.length !== 3 ||
  reviewedFrenchTalents.version !== 1 || !reviewedFrenchTalents.context ||
  !Object.keys(reviewedFrenchTalents.entries ?? {}).length ||
  reviewedFrenchRenamedItems.version !== 1 || !reviewedFrenchRenamedItems.context ||
  !Object.keys(reviewedFrenchRenamedItems.items ?? {}).length ||
  reviewedGermanTravel.version !== 1 || !reviewedGermanTravel.context ||
  !Object.keys(reviewedGermanTravel.cities ?? {}).length ||
  reviewedSharedDescriptions.version !== 1 || !reviewedSharedDescriptions.context ||
  !Object.keys(reviewedSharedDescriptions.items ?? {}).length ||
  !Object.keys(reviewedSharedDescriptions.lockpicks ?? {}).length ||
  !Object.keys(reviewedSharedDescriptions.areaDescriptions ?? {}).length ||
  !reviewedSharedDescriptions.notImplementedQuest?.translations ||
  !Object.keys(reviewedSharedDescriptions.notImplementedKeys?.ids ?? {}).length ||
  !Object.keys(reviewedSharedDescriptions.invalidLoot?.ids ?? {}).length ||
  Object.keys(reviewedSharedDescriptions.lockpickTemplates ?? {}).sort().join() !==
    [...locales].sort().join() ||
  reviewedLegacyFlavor.version !== 1 || !reviewedLegacyFlavor.context ||
  !Object.keys(reviewedLegacyFlavor.items ?? {}).length ||
  reviewedChineseLegacy.version !== 1 || !reviewedChineseLegacy.context ||
  !reviewedChineseLegacy.cooking?.ids?.length ||
  !Object.keys(reviewedChineseLegacy.mounts ?? {}).length ||
  !Object.keys(reviewedChineseLegacy.souvenirShirts ?? {}).length ||
  !Object.keys(reviewedChineseLegacy.authoredSouvenirShirts ?? {}).length ||
  reviewedConsumableNames.version !== 1 || !reviewedConsumableNames.context ||
  !Object.keys(reviewedConsumableNames.items ?? {}).length ||
  reviewedDeprecatedNames.version !== 1 || !reviewedDeprecatedNames.context ||
  Object.keys(reviewedDeprecatedNames.deprecatedItems ?? {}).length !== 33 ||
  Object.keys(reviewedDeprecatedNames.oldItems ?? {}).length !== 4 ||
  Object.keys(reviewedDeprecatedNames.prefixes ?? {}).sort().join() !== [...locales].sort().join() ||
  reviewedChineseItemNames.version !== 1 || !reviewedChineseItemNames.context ||
  Object.keys(reviewedChineseItemNames.items ?? {}).length < 16 ||
  reviewedTraditionalItemNames.version !== 1 || !reviewedTraditionalItemNames.context ||
  !Object.keys(reviewedTraditionalItemNames.items ?? {}).length) {
  throw new Error("Invalid reviewed Chinese teaching text source");
}
const supplementedCounts = {};
const authoredCounts = {};
const reviewedVisibleItemCounts = {};
for (const locale of locales) {
  const path = join(directory, `${locale}.json`);
  const raw = await readFile(path, "utf8");
  const pack = JSON.parse(raw);
  if (pack.version !== 1 || pack.values.length !== source.keys.length) {
    throw new Error(`${locale}: invalid client locale pack`);
  }
  let added = 0;
  for (const [target, reference] of Object.entries(duplicates)) {
    const targetIndex = indexByKey.get(target);
    const referenceIndex = indexByKey.get(reference);
    if (pack.values[targetIndex]) continue;
    const value = pack.values[referenceIndex];
    if (!value) continue;
    pack.values[targetIndex] = value;
    added += 1;
  }
  let translatedEnglish = 0;
  for (const [english, indexes] of [...itemDescriptionGroups, ...itemNameGroups, ...areaNameGroups]) {
    if (indexes.length < 2) continue;
    const localized = new Set(indexes.map((index) => pack.values[index])
      .filter((value) => value && value !== english));
    if (localized.size !== 1) continue;
    const [value] = localized;
    for (const index of indexes) {
      if (pack.values[index] !== english) continue;
      pack.values[index] = value;
      translatedEnglish += 1;
    }
  }
  let translatedSpellNames = 0;
  for (const [english, indexes] of spellNameGroups) {
    if (indexes.length < 2) continue;
    const localized = new Set(indexes.map((index) => pack.values[index])
      .filter((value) => value && value !== english));
    if (localized.size !== 1) continue;
    const [value] = localized;
    if (numberSignature(value) !== numberSignature(english) &&
      reviewedNumberlessSpellNames[locale]?.[english] !== value) continue;
    for (const index of indexes) {
      if (pack.values[index] !== english) continue;
      pack.values[index] = value;
      translatedSpellNames += 1;
    }
  }
  let nativeEnchantNames = 0;
  let reviewedItemNames = 0;
  for (const [id, spellIds] of Object.entries(enchantItemsWithNativeSpells)) {
    const itemIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const english = source.values[itemIndex];
    const nativeNames = new Set(spellIds.map((spellId) =>
      pack.values[indexByKey.get(`SpellName:${spellId}:0`)]));
    if (nativeNames.size !== 1 || nativeNames.has(english) || nativeNames.has("")) {
      throw new Error(`${locale}/${id}: matching enchant spells lack one native name`);
    }
    if (pack.values[itemIndex] === english) {
      pack.values[itemIndex] = [...nativeNames][0];
      nativeEnchantNames += 1;
    }
  }
  for (const [id, { spellId, category }] of Object.entries(reviewedItemSpellNames[locale] ?? {})) {
    const itemIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const spellIndex = indexByKey.get(`SpellName:${spellId}:0`);
    const english = source.values[itemIndex];
    const native = pack.values[spellIndex];
    if (catalogItems.get(id)?.name !== english || catalogItems.get(id)?.category !== category ||
      source.values[spellIndex] !== english || !native || native === english ||
      (pack.values[itemIndex] !== english && pack.values[itemIndex] !== native)) {
      throw new Error(`${locale}/${id}: reviewed item and native spell diverged`);
    }
    if (pack.values[itemIndex] === english) {
      pack.values[itemIndex] = native;
      reviewedItemNames += 1;
    }
  }
  let reviewedSpellNames = 0;
  for (const [spellId, { itemId, category, locales: selectedLocales }] of Object.entries(reviewedSpellItemNames)) {
    if (selectedLocales && !selectedLocales.includes(locale)) continue;
    const spellIndex = indexByKey.get(`SpellName:${spellId}:0`);
    const itemIndex = indexByKey.get(`ItemSparse:${itemId}:4`);
    const english = source.values[spellIndex];
    const native = pack.values[itemIndex];
    if (catalogItems.get(String(itemId))?.name !== english ||
      catalogItems.get(String(itemId))?.category !== category ||
      source.values[itemIndex] !== english || !native || native === english ||
      (pack.values[spellIndex] !== english && pack.values[spellIndex] !== native)) {
      throw new Error(`${locale}/${spellId}: reviewed spell and client item diverged`);
    }
    if (pack.values[spellIndex] === english) {
      pack.values[spellIndex] = native;
      reviewedSpellNames += 1;
    }
  }
  if (locale === "zhCN") for (const [id, { baseId, spellId }] of Object.entries(reviewedPermanentChineseItems)) {
    const itemIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const baseIndex = indexByKey.get(`ItemSparse:${baseId}:4`);
    const spellIndex = indexByKey.get(`SpellName:${spellId}:0`);
    const english = source.values[itemIndex];
    const baseName = source.values[baseIndex];
    const native = `永久${pack.values[baseIndex]}`;
    if (english !== `Permanent ${baseName}` || source.values[spellIndex] !== english ||
      catalogItems.get(id)?.name !== english ||
      catalogItems.get(id)?.category !== "Consumable · Other" ||
      catalogItems.get(String(baseId))?.name !== baseName ||
      !pack.values[baseIndex] || pack.values[baseIndex] === baseName) {
      throw new Error(`zhCN/${id}: permanent item source or native base changed`);
    }
    for (const index of [itemIndex, spellIndex]) {
      if (pack.values[index] !== english && pack.values[index] !== native) {
        throw new Error(`zhCN/${id}: permanent item conflicts with native text`);
      }
      if (pack.values[index] === english) { pack.values[index] = native; reviewedItemNames += 1; }
    }
  }
  if (locale === "zhCN") for (const [id, secondVolumeId] of Object.entries(reviewedChineseFirstVolumeBooks)) {
    const index = indexByKey.get(`ItemSparse:${id}:4`);
    const secondIndex = indexByKey.get(`ItemSparse:${secondVolumeId}:4`);
    const english = source.values[index];
    const secondEnglish = source.values[secondIndex];
    const secondNative = pack.values[secondIndex];
    const native = secondNative?.replace(/ II$/, "");
    if (secondEnglish !== `${english} II` ||
      catalogItems.get(id)?.name !== english ||
      catalogItems.get(id)?.category !== "Recipe · Book" ||
      catalogItems.get(String(secondVolumeId))?.name !== secondEnglish ||
      catalogItems.get(String(secondVolumeId))?.category !== "Recipe · Book" ||
      !secondNative?.endsWith(" II") || secondNative === secondEnglish ||
      !native || (pack.values[index] !== english && pack.values[index] !== native)) {
      throw new Error(`zhCN/${id}: matching client book series changed`);
    }
    if (pack.values[index] === english) { pack.values[index] = native; reviewedItemNames += 1; }
  }
  if (locale === "frFR") for (const [id, roman] of [[8840, "II"], [8889, "IV"]]) {
    const baseIndex = indexByKey.get("ItemSparse:4145:4");
    const index = indexByKey.get(`ItemSparse:${id}:4`);
    const english = `Tome of Conjure Mana Gem ${roman}`;
    const baseNative = pack.values[baseIndex];
    const native = `${baseNative} ${roman}`;
    if (source.values[baseIndex] !== "Tome of Conjure Mana Gem" ||
      source.values[index] !== english || catalogItems.get(String(id))?.name !== english ||
      catalogItems.get(String(id))?.category !== "Recipe · Book" ||
      !baseNative || baseNative === source.values[baseIndex] ||
      (pack.values[index] !== english && pack.values[index] !== native)) {
      throw new Error(`frFR/${id}: mana gem tome identity changed`);
    }
    if (pack.values[index] === english) { pack.values[index] = native; reviewedItemNames += 1; }
  }
  if (locale === "esES") {
    const index = indexByKey.get("ItemSparse:2414:4");
    const english = "Pinto Bridle";
    const native = mexicanSpanish.values[index];
    if (source.values[index] !== english ||
      catalogItems.get("2414")?.name !== english ||
      catalogItems.get("2414")?.category !== "Miscellaneous · Mount" ||
      !native || native === english ||
      (pack.values[index] !== english && pack.values[index] !== native)) {
      throw new Error("esES/2414: matching Mexican Spanish mount name changed");
    }
    if (pack.values[index] === english) { pack.values[index] = native; reviewedItemNames += 1; }
  }
  for (const [target, reference] of Object.entries(reviewedVariant[locale] ?? {})) {
    const targetIndex = indexByKey.get(target);
    const referenceIndex = indexByKey.get(reference);
    const value = pack.values[referenceIndex];
    if (!value || value === source.values[targetIndex]) {
      throw new Error(`${locale}: reviewed client description reference is untranslated: ${reference}`);
    }
    if (pack.values[targetIndex] === source.values[targetIndex]) {
      pack.values[targetIndex] = value;
      translatedEnglish += 1;
    } else if (pack.values[targetIndex] !== value) {
      throw new Error(`${locale}: reviewed client description changed: ${target}`);
    }
  }
  for (const [id, record] of Object.entries(authoredClientText.items)) {
    if (record.nameReferenceKey) {
      const nativeName = pack.values[indexByKey.get(record.nameReferenceKey)];
      const reviewedName = record.referenceNames[locale];
      if (!reviewedName || !nativeName?.includes(reviewedName) ||
        !record.translations[locale].description.includes(reviewedName)) {
        throw new Error(`${id}/${locale}: client character name differs from authored description`);
      }
    }
    for (const [field, english] of [[4, record.name],
      ...(record.description === undefined ? [] : [[0, record.description]])]) {
      const index = indexByKey.get(`ItemSparse:${id}:${field}`);
      if (pack.values[index] === english) pack.values[index] = record.translations[locale][field === 4 ? "name" : "description"];
    }
    if (record.relatedItemIds?.length || record.relatedSpellIds?.length) {
      const localizedEnchant = localizedRelatedName(record, locale);
      for (const [table, ids] of [["ItemSparse", record.relatedItemIds ?? []],
        ["SpellName", record.relatedSpellIds ?? []]]) {
        for (const relatedId of ids) {
          const index = indexByKey.get(`${table}:${relatedId}:${table === "ItemSparse" ? 4 : 0}`);
          if (pack.values[index] === source.values[index]) pack.values[index] = localizedEnchant;
        }
      }
    }
  }
  const triggerName = authoredClientText.items["260808"].translations[locale].name;
  const triggerRecipe = pack.values[indexByKey.get("ItemSparse:264218:0")];
  const nativeBombName = pack.values[indexByKey.get("ItemSparse:260809:4")];
  if (!triggerRecipe.includes(triggerName) ||
    localizedRelatedName(authoredClientText.items["264218"], locale) !== triggerName ||
    localizedRelatedName(authoredClientText.items["264219"], locale) !== nativeBombName) {
    throw new Error(`${locale}: reviewed engineering names differ from native client text`);
  }
  if (locale === "esES") for (const key of esESItemsWithEsMXClientText) {
    const index = indexByKey.get(key);
    if (index === undefined || !source.values[index] || !mexicanSpanish.values[index]) {
      throw new Error(`Missing same-item Spanish client text: ${key}`);
    }
    if (!pack.values[index]) { pack.values[index] = mexicanSpanish.values[index]; added += 1; }
  }
  let reviewedRegionalNames = 0;
  for (const [key, record] of Object.entries(reviewedSpanishGaps.entries[locale] ?? {})) {
    const index = indexByKey.get(key);
    const donor = locale === "esES" ? mexicanSpanish : europeanSpanish;
    if (!/^(?:ItemSparse|SpellName|Creature):\d+:[04]$/.test(key) ||
      index === undefined || source.values[index] !== record.en ||
      !record.context || !record.translated || record.translated === record.en ||
      donor.values[index] !== record.translated ||
      (pack.values[index] !== record.en && pack.values[index] !== record.translated)) {
      throw new Error(`${locale}/${key}: reviewed Spanish identity or context changed`);
    }
    if (pack.values[index] === record.en) {
      pack.values[index] = record.translated;
      reviewedRegionalNames += 1;
    }
  }
  let reviewedChineseDescriptions = 0;
  if (locale === "zhCN") {
    const spellNames = new Map();
    for (const [index, key] of source.keys.entries()) {
      if (!/^SpellName:\d+:0$/.test(key) || !pack.values[index] ||
        pack.values[index] === source.values[index]) continue;
      const names = spellNames.get(source.values[index]) ?? new Set();
      names.add(pack.values[index]);
      spellNames.set(source.values[index], names);
    }
    for (const [id, english] of Object.entries(reviewedChineseTeachingText.entries)) {
      const index = indexByKey.get(`ItemSparse:${id}:0`);
      const parsed = /^Teaches (.+?)(?: \(Rank (\d+)\))?\.$/.exec(english);
      const names = parsed && spellNames.get(parsed[1]);
      const traditional = traditionalChinese.values[index];
      if (!/^\d+$/.test(id) || index === undefined ||
        source.values[index] !== english ||
        catalogItems.get(id)?.category !== "Recipe · Book" ||
        catalogItems.get(id)?.description !== english ||
        !traditional?.startsWith("教你學會施放") ||
        (parsed?.[2] ? !traditional.includes(`等級 ${parsed[2]}`) : /等級/.test(traditional)) ||
        names?.size !== 1 || /[a-z]{2}/i.test([...names][0])) {
        throw new Error(`zhCN/${id}: reviewed book or native spell identity changed`);
      }
      const translated = `教你学会施放${[...names][0]}${parsed[2] ? `（等级 ${parsed[2]}）` : ""}。`;
      if (pack.values[index] !== english && pack.values[index] !== translated) {
        throw new Error(`zhCN/${id}: reviewed book description conflicts with client text`);
      }
      if (pack.values[index] === english) {
        pack.values[index] = translated;
        reviewedChineseDescriptions += 1;
      }
    }
    for (const [id, record] of Object.entries(reviewedChineseAmbiguousTeachingText.entries)) {
      const index = indexByKey.get(`ItemSparse:${id}:0`);
      const parsed = /^Teaches (.+?)(?: \(Rank (\d+)\))?\.$/.exec(record.en);
      const names = parsed && spellNames.get(parsed[1]);
      const traditional = traditionalChinese.values[index];
      const traditionalSpell = /^教你學會施放(.+?)(?:\s*（等級 \d+）)?。$/
        .exec(traditional)?.[1].trim();
      const evidenceIndex = record.nameEvidenceKey
        ? indexByKey.get(record.nameEvidenceKey) : undefined;
      if (!/^\d+$/.test(id) || Object.hasOwn(reviewedChineseTeachingText.entries, id) ||
        index === undefined || source.values[index] !== record.en ||
        catalogItems.get(id)?.category !== "Recipe · Book" ||
        catalogItems.get(id)?.description !== record.en ||
        (parsed?.[2] ? !traditional.includes(`等級 ${parsed[2]}`) : /等級/.test(traditional)) ||
        traditionalSpell !== record.traditionalSpell ||
        names?.size <= 1 || !names?.has(record.simplifiedSpell) ||
        (record.nameEvidenceKey &&
          (record.nameEvidenceKey !== `ItemSparse:${id}:4` ||
            !source.values[evidenceIndex]?.includes(parsed[1]) ||
            !pack.values[evidenceIndex]?.includes(record.simplifiedSpell))) ||
        /[a-z]{2}/i.test(record.simplifiedSpell)) {
        throw new Error(`zhCN/${id}: reviewed ambiguous book spell changed`);
      }
      const translated = `教你学会施放${record.simplifiedSpell}${parsed[2] ? `（等级 ${parsed[2]}）` : ""}。`;
      if (pack.values[index] !== record.en && pack.values[index] !== translated) {
        throw new Error(`zhCN/${id}: reviewed ambiguous book description conflicts with client text`);
      }
      if (pack.values[index] === record.en) {
        pack.values[index] = translated;
        reviewedChineseDescriptions += 1;
      }
    }
    for (const [id, record] of Object.entries(reviewedChineseOtherTeachingText.entries)) {
      const index = indexByKey.get(`ItemSparse:${id}:0`);
      const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
      const spellIndex = record.spellKey ? indexByKey.get(record.spellKey) : undefined;
      const spellEnglish = /^Teaches (.+?)(?: \(Rank \d+\))?\.$/.exec(record.en)?.[1];
      if (!/^\d+$/.test(id) || index === undefined || nameIndex === undefined ||
        Object.hasOwn(reviewedChineseTeachingText.entries, id) ||
        Object.hasOwn(reviewedChineseAmbiguousTeachingText.entries, id) ||
        source.values[index] !== record.en || traditionalChinese.values[index] !== record.tw ||
        catalogItems.get(id)?.category !== (record.category ?? "Recipe · Book") ||
        catalogItems.get(id)?.description !== record.en ||
        pack.values[nameIndex] !== record.cnName ||
        !record.translated || record.translated === record.en ||
        (record.spellKey &&
          (!/^SpellName:\d+:0$/.test(record.spellKey) || spellIndex === undefined ||
            source.values[spellIndex] !== (record.spellEnglish ?? spellEnglish) ||
            !record.translated.includes(pack.values[spellIndex]) ||
            pack.values[spellIndex] === spellEnglish))) {
        throw new Error(`zhCN/${id}: reviewed book, native title or spell changed`);
      }
      if (pack.values[index] !== record.en && pack.values[index] !== record.translated) {
        throw new Error(`zhCN/${id}: reviewed book description conflicts with client text`);
      }
      if (pack.values[index] === record.en) {
        pack.values[index] = record.translated;
        reviewedChineseDescriptions += 1;
      }
    }
  }
  let reviewedPortugueseDescriptions = 0;
  if (locale === "ptBR") {
    const setDescription = (id, english, translated, allowUncataloged = false) => {
      const index = indexByKey.get(`ItemSparse:${id}:0`);
      if (index === undefined || source.values[index] !== english ||
        (!allowUncataloged && catalogItems.get(String(id))?.description !== english) ||
        (pack.values[index] !== english && pack.values[index] !== translated)) {
        throw new Error(`ptBR/${id}: reviewed recipe description changed`);
      }
      if (pack.values[index] === english) {
        pack.values[index] = translated;
        reviewedPortugueseDescriptions += 1;
      }
    };
    for (const id of reviewedPortugueseTeachingText.tailoringIds) {
      const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
      const descriptionIndex = indexByKey.get(`ItemSparse:${id}:0`);
      const englishName = source.values[nameIndex];
      const englishDescription = source.values[descriptionIndex];
      const garment = /^Teaches you how to sew (?:a )?(.+)\.$/.exec(englishDescription)?.[1];
      const nativeName = pack.values[nameIndex];
      if (!Number.isInteger(id) || catalogItems.get(String(id))?.category !== "Recipe · Tailoring" ||
        englishName !== `Pattern: ${garment}` || !nativeName?.startsWith("Molde: ") ||
        nativeName === englishName) {
        throw new Error(`ptBR/${id}: reviewed tailoring pattern changed`);
      }
      setDescription(id, englishDescription,
        `Ensina a confeccionar ${nativeName.slice("Molde: ".length)}.`);
    }
    for (const [id, record] of Object.entries(reviewedPortugueseTeachingText.spellEntries)) {
      const spellIndex = indexByKey.get(record.spellKey);
      const nativeSpell = pack.values[spellIndex];
      const englishSpell = /^Teaches (.+?) \(Rank (\d+)\)\.$/.exec(record.en);
      if (catalogItems.get(id)?.category !== "Recipe · Book" ||
        !/^SpellName:\d+:0$/.test(record.spellKey) || spellIndex === undefined ||
        source.values[spellIndex] !== englishSpell?.[1] ||
        !nativeSpell || nativeSpell === englishSpell?.[1] ||
        record.translated !== `Ensina ${nativeSpell} (Grau ${englishSpell[2]}).`) {
        throw new Error(`ptBR/${id}: reviewed native spell changed`);
      }
      setDescription(id, record.en, record.translated);
    }
    for (const [id, record] of Object.entries(reviewedPortugueseTeachingText.craftEntries)) {
      const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
      if (catalogItems.get(id)?.category !== record.category ||
        pack.values[nameIndex] !== record.ptName ||
        !record.ptName.includes(": ") ||
        record.translated !== `Ensina a fazer ${record.ptName.split(": ").slice(1).join(": ").trim()}.`) {
        throw new Error(`ptBR/${id}: reviewed crafting item changed`);
      }
      setDescription(id, record.en, record.translated);
    }
    for (const [id, record] of Object.entries(reviewedPortugueseTeachingText.spellCraftEntries)) {
      const spellIndex = indexByKey.get(record.spellKey);
      const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
      const obsoleteBaseId = reviewedDeprecatedNames.deprecatedItems[id];
      const reviewedObsoleteName = obsoleteBaseId
        ? reviewedDeprecatedNames.prefixes[locale].deprecated.replace("{name}",
          pack.values[indexByKey.get(`ItemSparse:${obsoleteBaseId}:4`)]) : undefined;
      const englishCraft = /^Teaches you how to (?:craft|make) (?:a |an )?(.+)\.$/
        .exec(record.en)?.[1];
      const nativeCraft = pack.values[spellIndex];
      const verb = record.category === "Recipe · Tailoring" ? "confeccionar" : "fazer";
      if (!/^(?:Recipe · Tailoring|Recipe · Alchemy)$/.test(record.category) ||
        source.values[nameIndex] !== record.enName ||
        (pack.values[nameIndex] !== record.enName &&
          pack.values[nameIndex] !== reviewedObsoleteName) ||
        !/^SpellName:\d+:0$/.test(record.spellKey) || spellIndex === undefined ||
        source.values[spellIndex] !== englishCraft ||
        !nativeCraft || nativeCraft === englishCraft ||
        record.translated !== `Ensina a ${verb} ${nativeCraft}.`) {
        throw new Error(`ptBR/${id}: reviewed crafted spell changed`);
      }
      setDescription(id, record.en, record.translated, true);
    }
  }
  let reviewedFrenchPotionFields = 0;
  let reviewedFrenchTalentFields = 0;
  if (locale === "frFR") {
    const record = reviewedFrenchPotion;
    const keys = [
      [`ItemSparse:${record.itemId}:4`, record.enItem, record.frItem],
      [`ItemSparse:${record.recipeId}:4`, record.enRecipe, record.frRecipe],
      [`ItemSparse:${record.recipeId}:0`, record.enDescription, record.frDescription],
      ...record.spellIds.map((id) => [`SpellName:${id}:0`, record.enItem, record.frItem]),
    ];
    if (catalogItems.get(String(record.itemId))?.name !== record.siteItem ||
      catalogItems.get(String(record.recipeId))?.name !== record.siteRecipe ||
      catalogItems.get(String(record.recipeId))?.description !== record.siteDescription ||
      catalogItems.get(String(record.recipeId))?.category !== "Recipe · Alchemy" ||
      record.enRecipe !== `Recipe: ${record.enItem}` ||
      record.enDescription !== `Teaches you how to craft ${record.enItem}.` ||
      record.frRecipe !== `Recette : ${record.frItem}` ||
      record.frDescription !== `Vous apprend à concocter une ${record.frItem.toLowerCase()}.`) {
      throw new Error("frFR: reviewed predatory senses identity changed");
    }
    for (const [key, english, translated] of keys) {
      const index = indexByKey.get(key);
      if (index === undefined || source.values[index] !== english ||
        (pack.values[index] !== english && pack.values[index] !== translated)) {
        throw new Error(`frFR: reviewed predatory senses field changed: ${key}`);
      }
      if (pack.values[index] === english) {
        pack.values[index] = translated;
        reviewedFrenchPotionFields += 1;
      }
    }
    for (const [id, talent] of Object.entries(reviewedFrenchTalents.entries)) {
      const index = indexByKey.get(`SpellName:${id}:0`);
      const referenceIndex = indexByKey.get(talent.referenceKey);
      const evidenceMatches = talent.evidence === `https://foreverdb.net/fr/spell/${id}` ||
        talent.evidence?.startsWith(`https://www.wowhead.com/classic/fr/spell%3D${id}/`);
      if (!/^\d+$/.test(id) || index === undefined ||
        !/^SpellName:\d+:0$/.test(talent.referenceKey) || referenceIndex === undefined ||
        source.values[index] !== talent.en ||
        source.values[referenceIndex] !== talent.referenceEn ||
        pack.values[referenceIndex] !== talent.referenceFr ||
        (talent.referenceTerm &&
          (!talent.referenceFr.includes(talent.referenceTerm) ||
            !evidenceMatches)) ||
        !talent.fr.includes(talent.referenceTerm ?? talent.referenceFr) ||
        talent.fr === talent.en ||
        (pack.values[index] !== talent.en && pack.values[index] !== talent.fr)) {
        throw new Error(`frFR/${id}: reviewed talent or native reference changed`);
      }
      if (pack.values[index] === talent.en) {
        pack.values[index] = talent.fr;
        reviewedFrenchTalentFields += 1;
      }
    }
  }
  let reviewedGermanTravelFields = 0;
  if (locale === "deDE") {
    const seen = new Set();
    for (const [city, record] of Object.entries(reviewedGermanTravel.cities)) {
      if (!record.de || record.de === city ||
        !record.teleports?.length || !record.portals?.length) {
        throw new Error(`deDE/${city}: incomplete reviewed travel spell`);
      }
      for (const [ids, englishPrefix, germanPrefix] of [
        [record.teleports, "Teleport", "Teleportieren"],
        [record.portals, "Portal", "Portal"],
      ]) for (const id of ids) {
        const key = `SpellName:${id}:0`;
        const index = indexByKey.get(key);
        const original = `${englishPrefix}: ${city}`;
        const before = `${germanPrefix}: ${city}`;
        const translated = `${germanPrefix}: ${record.de}`;
        if (!Number.isInteger(id) || seen.has(id) || index === undefined ||
          source.values[index] !== original ||
          (pack.values[index] !== before && pack.values[index] !== translated)) {
          throw new Error(`deDE/${key}: reviewed travel spell identity changed`);
        }
        seen.add(id);
        if (pack.values[index] === before) {
          pack.values[index] = translated;
          reviewedGermanTravelFields += 1;
        }
      }
    }
  }
  let reviewedSharedDescriptionFields = 0;
  for (const [id, record] of Object.entries(reviewedSharedDescriptions.items)) {
    const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const descriptionIndex = indexByKey.get(`ItemSparse:${id}:0`);
    const referenceIndex = record.nameReferenceKey
      ? indexByKey.get(record.nameReferenceKey) : undefined;
    const translated = record.translations?.[locale];
    const nativeReference = record.nameReferenceKey
      ? pack.values[referenceIndex]?.replace(/^A /, "") : undefined;
    if (!/^\d+$/.test(id) || nameIndex === undefined || descriptionIndex === undefined ||
      source.values[nameIndex] !== record.enName ||
      source.values[descriptionIndex] !== record.enDescription ||
      catalogItems.get(id)?.name !== record.enName ||
      catalogItems.get(id)?.description !== record.enDescription ||
      catalogItems.get(id)?.category !== record.category ||
      !translated || translated === record.enDescription ||
      Object.keys(record.translations).sort().join() !== [...locales].sort().join() ||
      (record.nameReferenceKey &&
        (referenceIndex === undefined ||
          source.values[referenceIndex] !== record.nameReferenceEnglish ||
          !nativeReference || nativeReference === record.nameReferenceEnglish ||
          !translated.includes(nativeReference))) ||
      (pack.values[descriptionIndex] !== record.enDescription &&
        pack.values[descriptionIndex] !== translated)) {
      throw new Error(`${locale}/${id}: reviewed shared item description changed`);
    }
    if (pack.values[descriptionIndex] === record.enDescription) {
      pack.values[descriptionIndex] = translated;
      reviewedSharedDescriptionFields += 1;
    }
  }
  for (const [id, difficulty] of Object.entries(reviewedSharedDescriptions.lockpicks)) {
    const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const descriptionIndex = indexByKey.get(`ItemSparse:${id}:0`);
    const english = `Opens difficulty ${difficulty} locks.`;
    const translated = reviewedSharedDescriptions.lockpickTemplates[locale]
      ?.replace("{difficulty}", String(difficulty));
    if (!/^\d+$/.test(id) || !Number.isInteger(difficulty) ||
      nameIndex === undefined || descriptionIndex === undefined ||
      !source.values[nameIndex]?.startsWith("Deprecated ") ||
      !source.values[nameIndex]?.endsWith(" Lockpick") ||
      source.values[descriptionIndex] !== english || !translated ||
      translated.includes("{difficulty}") || translated === english ||
      (pack.values[descriptionIndex] !== english &&
        pack.values[descriptionIndex] !== translated)) {
      throw new Error(`${locale}/${id}: reviewed lockpick description changed`);
    }
    if (pack.values[descriptionIndex] === english) {
      pack.values[descriptionIndex] = translated;
      reviewedSharedDescriptionFields += 1;
    }
  }
  for (const [id, record] of Object.entries(reviewedSharedDescriptions.areaDescriptions)) {
    const itemIndex = indexByKey.get(`ItemSparse:${id}:0`);
    const areaIndex = indexByKey.get(record.areaKey);
    const englishArea = record.areaEnglish.replace(/^The /, "");
    const nativeArea = pack.values[areaIndex];
    const translated = `-${nativeArea}`;
    const item = catalogItems.get(id);
    if (!/^\d+$/.test(id) || itemIndex === undefined || areaIndex === undefined ||
      !/^AreaTable:\d+:1$/.test(record.areaKey) ||
      source.values[areaIndex] !== record.areaEnglish ||
      record.en !== `-${englishArea}` || source.values[itemIndex] !== record.en ||
      item?.name !== "Fragment of the Nightmare's Corruption" ||
      item?.category !== "Quest" || item?.description !== record.en ||
      !nativeArea) {
      throw new Error(`${locale}/${id}: reviewed quest item area changed`);
    }
    if (pack.values[itemIndex] === record.en && translated !== record.en) {
      pack.values[itemIndex] = translated;
      reviewedSharedDescriptionFields += 1;
    }
  }
  const questPlaceholder = reviewedSharedDescriptions.notImplementedQuest;
  const questPlaceholderIndex = indexByKey.get(`ItemSparse:${questPlaceholder.id}:0`);
  const questPlaceholderTranslation = questPlaceholder.translations[locale];
  if (questPlaceholderIndex === undefined ||
    source.values[questPlaceholderIndex] !== questPlaceholder.en ||
    catalogItems.get(String(questPlaceholder.id))?.name !== questPlaceholder.enName ||
    catalogItems.get(String(questPlaceholder.id))?.category !== "Quest" ||
    catalogItems.get(String(questPlaceholder.id))?.description !== questPlaceholder.en ||
    Object.keys(questPlaceholder.translations).sort().join() !== [...locales].sort().join() ||
    !questPlaceholderTranslation || questPlaceholderTranslation === questPlaceholder.en ||
    (pack.values[questPlaceholderIndex] !== questPlaceholder.en &&
      pack.values[questPlaceholderIndex] !== questPlaceholderTranslation)) {
    throw new Error(`${locale}: reviewed quest placeholder description changed`);
  }
  if (pack.values[questPlaceholderIndex] === questPlaceholder.en) {
    pack.values[questPlaceholderIndex] = questPlaceholderTranslation;
    reviewedSharedDescriptionFields += 1;
  }
  const cameraKeys = reviewedSharedDescriptions.notImplementedKeys;
  const cameraTranslation = cameraKeys.translations[locale];
  if (Object.keys(cameraKeys.translations).sort().join() !== [...locales].sort().join() ||
    !cameraTranslation || cameraTranslation === cameraKeys.en) {
    throw new Error(`${locale}: reviewed camera key placeholder changed`);
  }
  for (const [id, name] of Object.entries(cameraKeys.ids)) {
    const index = indexByKey.get(`ItemSparse:${id}:0`);
    const item = catalogItems.get(id);
    if (!/^\d+$/.test(id) || index === undefined ||
      source.values[index] !== cameraKeys.en ||
      item?.name !== name || item?.category !== "Key · Key" ||
      item?.description !== cameraKeys.en ||
      (pack.values[index] !== cameraKeys.en &&
        pack.values[index] !== cameraTranslation)) {
      throw new Error(`${locale}/${id}: reviewed camera key changed`);
    }
    if (pack.values[index] === cameraKeys.en) {
      pack.values[index] = cameraTranslation;
      reviewedSharedDescriptionFields += 1;
    }
  }
  const invalidLoot = reviewedSharedDescriptions.invalidLoot;
  const categoryIndex = indexByKey.get(invalidLoot.categoryKey);
  const nativeCategory = pack.values[categoryIndex];
  const invalidLootTranslation = invalidLoot.templates[locale]?.replace("{category}", nativeCategory);
  if (categoryIndex === undefined || source.values[categoryIndex] !== invalidLoot.categoryEnglish ||
    !nativeCategory || nativeCategory === invalidLoot.categoryEnglish ||
    Object.keys(invalidLoot.templates).sort().join() !== [...locales].sort().join() ||
    !invalidLootTranslation || invalidLootTranslation.includes("{category}")) {
    throw new Error(`${locale}: reviewed miscellaneous category changed`);
  }
  for (const [id, name] of Object.entries(invalidLoot.ids)) {
    const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const descriptionIndex = indexByKey.get(`ItemSparse:${id}:0`);
    const item = catalogItems.get(id);
    if (!/^\d+$/.test(id) || nameIndex === undefined || descriptionIndex === undefined ||
      source.values[nameIndex] !== name || source.values[descriptionIndex] !== invalidLoot.en ||
      (item && (item.name !== name || item.description !== invalidLoot.en ||
        item.category !== "Miscellaneous · Junk")) ||
      (pack.values[descriptionIndex] !== invalidLoot.en &&
        pack.values[descriptionIndex] !== invalidLootTranslation)) {
      throw new Error(`${locale}/${id}: reviewed invalid loot description changed`);
    }
    if (pack.values[descriptionIndex] === invalidLoot.en) {
      pack.values[descriptionIndex] = invalidLootTranslation;
      reviewedSharedDescriptionFields += 1;
    }
  }
  let reviewedLegacyFlavorFields = 0;
  const mapEntityPack = JSON.parse(await readFile(join(directory,
    `map-entity-${locale}.json`), "utf8"));
  if (mapEntityPack.version !== 1 ||
    mapEntityPack.values.length !== mapEntitySource.keys.length) {
    throw new Error(`${locale}: invalid map entity pack for legacy flavor`);
  }
  for (const [id, record] of Object.entries(reviewedLegacyFlavor.items)) {
    const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
    const descriptionIndex = indexByKey.get(`ItemSparse:${id}:0`);
    const npcIndex = record.mapNpcKey ? mapEntityIndexByKey.get(record.mapNpcKey) : undefined;
    const translated = record.translations?.[locale];
    if (!/^\d+$/.test(id) || nameIndex === undefined || descriptionIndex === undefined ||
      source.values[nameIndex] !== record.enName ||
      source.values[descriptionIndex] !== record.enDescription ||
      catalogItems.has(id) || !translated || translated === record.enDescription ||
      Object.keys(record.translations).sort().join() !== [...locales].sort().join() ||
      (record.mapNpcKey &&
        (npcIndex === undefined ||
          mapEntitySource.values[npcIndex] !== record.mapNpcEnglish ||
          !mapEntityPack.values[npcIndex] ||
          !translated.includes(mapEntityPack.values[npcIndex]))) ||
      (id === "734" && !translated.includes("Footman Malakai Stone")) ||
      (id === "5896" && !translated.includes("Muren Macfeere")) ||
      (pack.values[descriptionIndex] !== record.enDescription &&
        pack.values[descriptionIndex] !== translated)) {
      throw new Error(`${locale}/${id}: reviewed legacy flavor or game name changed`);
    }
    if (pack.values[descriptionIndex] === record.enDescription) {
      pack.values[descriptionIndex] = translated;
      reviewedLegacyFlavorFields += 1;
    }
  }
  let reviewedChineseLegacyFields = 0;
  if (locale === "zhCN" || locale === "zhTW") {
    const setChineseLegacy = (id, name, english, translated) => {
      const nameIndex = indexByKey.get(`ItemSparse:${id}:4`);
      const descriptionIndex = indexByKey.get(`ItemSparse:${id}:0`);
      if (nameIndex === undefined || descriptionIndex === undefined ||
        source.values[nameIndex] !== name || source.values[descriptionIndex] !== english ||
        catalogItems.has(String(id)) || !translated || translated === english ||
        (pack.values[descriptionIndex] !== english &&
          pack.values[descriptionIndex] !== translated)) {
        throw new Error(`${locale}/${id}: reviewed Chinese legacy item changed`);
      }
      if (pack.values[descriptionIndex] === english) {
        pack.values[descriptionIndex] = translated;
        reviewedChineseLegacyFields += 1;
      }
    };
    const cooking = reviewedChineseLegacy.cooking;
    const cookingIndex = indexByKey.get(cooking.skillKey);
    const cookingName = pack.values[cookingIndex];
    const cookingTranslation = cooking.translations[locale];
    if (source.values[cookingIndex] !== cooking.skillEnglish || !cookingName ||
      cookingName === cooking.skillEnglish || !cookingTranslation?.includes(cookingName)) {
      throw new Error(`${locale}: reviewed cooking profession changed`);
    }
    for (const id of cooking.ids) {
      const name = source.values[indexByKey.get(`ItemSparse:${id}:4`)];
      if (!Number.isInteger(id) || !name?.startsWith("Deprecated ") ||
        !name.includes("Recipe:")) {
        throw new Error(`${locale}/${id}: reviewed old cooking recipe changed`);
      }
      setChineseLegacy(id, name, cooking.en, cookingTranslation);
    }
    const conjured = reviewedChineseLegacy.conjured;
    const conjuredIndex = indexByKey.get(conjured.referenceKey);
    const conjuredNative = pack.values[conjuredIndex];
    if (source.values[conjuredIndex] !== conjured.referenceEnglish ||
      !conjuredNative?.startsWith("魔法") ||
      !conjured.translations[locale]?.includes("魔法")) {
      throw new Error(`${locale}: reviewed conjured item term changed`);
    }
    setChineseLegacy(conjured.id, conjured.enName, conjured.en,
      conjured.translations[locale]);
    for (const [id, record] of Object.entries(reviewedChineseLegacy.mounts)) {
      const referenceIndex = indexByKey.get(record.referenceKey);
      const nativeName = pack.values[referenceIndex];
      const translated = record.translations[locale];
      if (!/^\d+$/.test(id) || referenceIndex === undefined ||
        source.values[referenceIndex] !== record.referenceEnglish ||
        !nativeName || nativeName === record.referenceEnglish ||
        !translated?.includes(nativeName) ||
        !record.enName.startsWith("Deprecated Amulet of the ")) {
        throw new Error(`${locale}/${id}: reviewed mount name changed`);
      }
      setChineseLegacy(id, record.enName, record.en, translated);
    }
    for (const [id, record] of Object.entries(reviewedChineseLegacy.souvenirShirts)) {
      const areaIndex = indexByKey.get(record.areaKey);
      const nativeArea = pack.values[areaIndex];
      const translated = record.translations[locale];
      if (!/^\d+$/.test(id) || areaIndex === undefined ||
        source.values[areaIndex] !== record.areaEnglish ||
        !record.en.includes(record.areaEnglish) ||
        !nativeArea || nativeArea === record.areaEnglish ||
        !translated?.includes(nativeArea)) {
        throw new Error(`${locale}/${id}: reviewed souvenir mine name changed`);
      }
      setChineseLegacy(id, record.enName, record.en, translated);
    }
    for (const [id, record] of Object.entries(reviewedChineseLegacy.authoredSouvenirShirts)) {
      const translated = record.translations?.[locale];
      if (!/^\d+$/.test(id) || !record.context ||
        !record.enName.includes("Darkhollow Mine") ||
        !record.en.includes("Darkhollow Mine") ||
        Object.keys(record.translations ?? {}).sort().join() !== "zhCN,zhTW" ||
        !translated?.includes(locale === "zhCN" ? "暗穴矿洞" : "暗穴礦坑")) {
        throw new Error(`${locale}/${id}: authored souvenir identity changed`);
      }
      setChineseLegacy(id, record.enName, record.en, translated);
    }
  }
  let reviewedConsumableNameFields = 0;
  for (const [id, record] of Object.entries(reviewedConsumableNames.items)) {
    const index = indexByKey.get(`ItemSparse:${id}:4`);
    const item = catalogItems.get(id);
    const translated = record.translations?.[locale];
    if (!/^\d+$/.test(id) || index === undefined ||
      source.values[index] !== record.en ||
      item?.name !== record.en || item?.category !== record.category ||
      item?.icon !== record.icon || !translated || translated === record.en ||
      Object.keys(record.translations).sort().join() !== [...locales].sort().join() ||
      (pack.values[index] !== record.en && pack.values[index] !== translated)) {
      throw new Error(`${locale}/${id}: reviewed consumable name changed`);
    }
    if (pack.values[index] === record.en) {
      pack.values[index] = translated;
      reviewedConsumableNameFields += 1;
    }
  }
  let reviewedDeprecatedNameFields = 0;
  for (const [kind, records, englishPrefix] of [
    ["deprecated", reviewedDeprecatedNames.deprecatedItems, "Deprecated "],
    ["old", reviewedDeprecatedNames.oldItems, "OLD"],
  ]) {
    const template = reviewedDeprecatedNames.prefixes[locale]?.[kind];
    if (typeof template !== "string" ||
      (template.match(/\{name\}/g) ?? []).length !== 1 ||
      /\{[^}]+\}/.test(template.replace("{name}", ""))) {
      throw new Error(`${locale}: invalid obsolete item name template`);
    }
    for (const [id, baseId] of Object.entries(records)) {
      const targetIndex = indexByKey.get(`ItemSparse:${id}:4`);
      const baseIndex = indexByKey.get(`ItemSparse:${baseId}:4`);
      const baseEnglish = source.values[baseIndex];
      const english = source.values[targetIndex];
      const nativeBase = pack.values[baseIndex];
      if (!/^\d+$/.test(id) || !Number.isInteger(baseId) ||
        targetIndex === undefined || baseIndex === undefined ||
        english !== `${englishPrefix}${baseEnglish}` ||
        !nativeBase || nativeBase === baseEnglish) {
        throw new Error(`${locale}/${id}: obsolete item identity or native base changed`);
      }
      if (pack.values[targetIndex] === english) {
        pack.values[targetIndex] = template.replace("{name}", nativeBase);
        reviewedDeprecatedNameFields += 1;
      }
    }
  }
  let reviewedChineseItemNameFields = 0;
  if (locale === "zhCN") for (const [id, record] of Object.entries(reviewedChineseItemNames.items)) {
    const index = indexByKey.get(`ItemSparse:${id}:4`);
    const spellIndex = record.spellKey ? indexByKey.get(record.spellKey) : undefined;
    const nativeSpell = spellIndex === undefined ? undefined : pack.values[spellIndex];
    if (!/^\d+$/.test(id) || index === undefined ||
      source.values[index] !== record.en || traditionalChinese.values[index] !== record.tw ||
      !record.zh || record.zh === record.en ||
      (record.spellKey && (spellIndex === undefined ||
        source.values[spellIndex] !== record.spellEnglish ||
        !nativeSpell || nativeSpell === record.spellEnglish ||
        !record.zh.includes(nativeSpell))) ||
      (pack.values[index] !== record.en && pack.values[index] !== record.zh)) {
      throw new Error(`zhCN/${id}: reviewed item name or native identity changed`);
    }
    if (pack.values[index] === record.en) {
      pack.values[index] = record.zh;
      reviewedChineseItemNameFields += 1;
    }
  }
  let reviewedTraditionalItemNameFields = 0;
  if (locale === "zhTW") for (const [id, record] of Object.entries(reviewedTraditionalItemNames.items)) {
    const index = indexByKey.get(`ItemSparse:${id}:4`);
    const spellIndex = indexByKey.get(record.spellKey);
    if (!/^\d+$/.test(id) || index === undefined || spellIndex === undefined ||
      source.values[index] !== record.en ||
      simplifiedChinese.values[index] !== record.cn ||
      source.values[spellIndex] !== record.spellEnglish ||
      pack.values[spellIndex] !== record.spellTraditional ||
      !record.tw?.includes(record.spellTraditional) || record.tw === record.en ||
      (pack.values[index] !== record.en && pack.values[index] !== record.tw)) {
      throw new Error(`zhTW/${id}: reviewed item name or spell identity changed`);
    }
    if (pack.values[index] === record.en) {
      pack.values[index] = record.tw;
      reviewedTraditionalItemNameFields += 1;
    }
  }
  for (const [id, record] of Object.entries(reviewedVisibleItemGaps.items)) {
    for (const [field, entry] of Object.entries(record.fields)) {
      const translation = entry.translations[locale];
      if (!translation) continue;
      const index = indexByKey.get(`ItemSparse:${id}:${field}`);
      const current = translation.current ?? entry.english;
      if ((translation.referenceLocale && europeanSpanish.values[index] !== translation.text) ||
        (pack.values[index] !== current && pack.values[index] !== translation.text)) {
        throw new Error(`${locale}/${id}/${field}: reviewed visible item text changed`);
      }
      if (pack.values[index] === current) {
        pack.values[index] = translation.text;
      }
    }
  }
  if (locale === "frFR") for (const [id, record] of Object.entries(reviewedFrenchRenamedItems.items)) {
    const key = `ItemSparse:${id}:4`;
    const index = indexByKey.get(key);
    const referenceIndex = indexByKey.get(record.referenceKey);
    if (index === undefined || referenceIndex === undefined ||
      catalogItems.get(id)?.name !== record.catalog ||
      source.values[index] !== record.en ||
      source.values[referenceIndex] !== record.referenceEnglish ||
      pack.values[referenceIndex] !== record.referenceFrench ||
      !record.fr || record.fr === record.en ||
      (pack.values[index] !== record.en && pack.values[index] !== record.fr)) {
      throw new Error(`frFR/${id}: reviewed renamed item identity changed`);
    }
    if (pack.values[index] === record.en) pack.values[index] = record.fr;
  }
  reviewedVisibleItemCounts[locale] = Object.entries(reviewedVisibleItemGaps.items)
    .flatMap(([id, record]) => Object.entries(record.fields).map(([field, entry]) =>
      [id, field, entry.translations[locale]]))
    .filter(([id, field, translation]) => translation &&
      pack.values[indexByKey.get(`ItemSparse:${id}:${field}`)] === translation.text).length;
  const output = JSON.stringify(pack);
  if (check) {
    if (output !== raw) throw new Error(`${locale}: equivalent client fields are stale`);
  } else if (output !== raw) await writeFile(path, output);
  supplementedCounts[locale] = pack.values.filter(Boolean).length - provenance.counts[locale];
  authoredCounts[locale] = Object.entries(authoredClientText.items).reduce((count, [id, record]) =>
    count + [[4, "name"], ...(record.description === undefined ? [] : [[0, "description"]])]
      .filter(([field, name]) =>
      pack.values[indexByKey.get(`ItemSparse:${id}:${field}`)] === record.translations[locale][name]).length +
      [...(record.relatedItemIds ?? []).map((relatedId) => `ItemSparse:${relatedId}:4`),
        ...(record.relatedSpellIds ?? []).map((relatedId) => `SpellName:${relatedId}:0`)]
        .filter((key) => pack.values[indexByKey.get(key)] ===
          localizedRelatedName(record, locale)).length, 0);
  if (supplementedCounts[locale] < 0) throw new Error(`${locale}: extracted client count exceeds pack count`);
  console.log(`${locale}: ${added} client gaps filled; ${translatedEnglish} exact item/area fields, ${translatedSpellNames} spell names, ${nativeEnchantNames} enchant items, ${reviewedItemNames} reviewed item/spell fields, ${reviewedSpellNames} reviewed spell names, ${reviewedRegionalNames} reviewed Spanish names, ${reviewedChineseDescriptions} Chinese and ${reviewedPortugueseDescriptions} Portuguese recipe descriptions, ${reviewedFrenchPotionFields} French potion fields, ${reviewedFrenchTalentFields} talent names, ${reviewedGermanTravelFields} German travel names, ${reviewedSharedDescriptionFields} shared item descriptions, ${reviewedLegacyFlavorFields} legacy flavor, ${reviewedChineseLegacyFields} Chinese legacy fields, ${reviewedConsumableNameFields} consumable names, ${reviewedDeprecatedNameFields} obsolete names and ${reviewedChineseItemNameFields} Chinese item names localized; ${supplementedCounts[locale]} supplemented in total`);
  if (reviewedTraditionalItemNameFields) {
    console.log(`${locale}: ${reviewedTraditionalItemNameFields} Traditional Chinese item names localized`);
  }
}
provenance.supplements = {
  script: "scripts/fill-client-locale-duplicate-gaps.mjs",
  reviewedSpanishCatalog: "data/client-locale-localization/reviewed-spanish-cross-region-gaps.json",
  reviewedChineseTeachingCatalog: "data/client-locale-localization/reviewed-zh-cn-teaching-text.json",
  reviewedChineseAmbiguousTeachingCatalog: "data/client-locale-localization/reviewed-zh-cn-ambiguous-teaching-text.json",
  reviewedChineseOtherTeachingCatalog: "data/client-locale-localization/reviewed-zh-cn-other-teaching-text.json",
  reviewedPortugueseTeachingCatalog: "data/client-locale-localization/reviewed-pt-br-teaching-text.json",
  reviewedFrenchPotionCatalog: "data/client-locale-localization/reviewed-fr-predatory-senses.json",
  reviewedFrenchTalentCatalog: "data/client-locale-localization/reviewed-fr-talent-names.json",
  reviewedGermanTravelCatalog: "data/client-locale-localization/reviewed-de-travel-spells.json",
  reviewedSharedDescriptionCatalog: "data/client-locale-localization/reviewed-shared-item-description-gaps.json",
  reviewedLegacyFlavorCatalog: "data/client-locale-localization/reviewed-legacy-item-flavor.json",
  reviewedChineseLegacyCatalog: "data/client-locale-localization/reviewed-zh-legacy-descriptions.json",
  reviewedConsumableNameCatalog: "data/client-locale-localization/reviewed-shared-consumable-names.json",
  reviewedDeprecatedNameCatalog: "data/client-locale-localization/reviewed-deprecated-item-names.json",
  reviewedChineseItemNameCatalog: "data/client-locale-localization/reviewed-zh-cn-item-name-gaps.json",
  reviewedTraditionalItemNameCatalog: "data/client-locale-localization/reviewed-zh-tw-item-name-gaps.json",
  method: "Equivalent English text in the same locale, including identical item and area fields, spell names with matching numbers, reviewed enchant items and matching item/spell names, Chinese permanent items from native base names, Chinese first-volume books from native second-volume titles, reviewed Chinese and Portuguese recipe descriptions from native spell names and item titles, French mana gem tomes from a native tome, reviewed French potion and talent identities, shared and old item descriptions using native area, mount and NPC terms, obsolete item names from native base items, reviewed Chinese names from exact traditional item identities and native spells, and reviewed esES items from exact esMX client identities",
  counts: supplementedCounts,
};
provenance.authoredClientText = {
  catalog: "data/item-name-localization/reviewed-client-english-gaps.json",
  method: "Reviewed contextual names for English-only client items; linked enchant items and spells use the same term when their client name is English, while native client names take precedence",
  counts: authoredCounts,
};
provenance.reviewedVisibleItemGaps = {
  catalog: "data/client-locale-localization/reviewed-visible-item-gaps.json",
  method: "Exact catalog item identity and field text, with matching esES client text for Spanish regional reuse",
  counts: reviewedVisibleItemCounts,
};
provenance.reviewedChineseTeachingText = {
  locale: "zhCN",
  catalogs: ["data/client-locale-localization/reviewed-zh-cn-teaching-text.json",
    "data/client-locale-localization/reviewed-zh-cn-ambiguous-teaching-text.json",
    "data/client-locale-localization/reviewed-zh-cn-other-teaching-text.json"],
  reviewedEntries: Object.keys(reviewedChineseTeachingText.entries).length +
    Object.keys(reviewedChineseAmbiguousTeachingText.entries).length +
    Object.keys(reviewedChineseOtherTeachingText.entries).length,
  method: "Exact recipe book descriptions use the native simplified Chinese spell name and the source rank; ambiguous spell names require matching traditional book text or the same item's native title",
};
provenance.reviewedPortugueseTeachingText = {
  locale: "ptBR",
  catalog: "data/client-locale-localization/reviewed-pt-br-teaching-text.json",
  reviewedEntries: reviewedPortugueseTeachingText.tailoringIds.length +
    Object.keys(reviewedPortugueseTeachingText.spellEntries).length +
    Object.keys(reviewedPortugueseTeachingText.craftEntries).length +
    Object.keys(reviewedPortugueseTeachingText.spellCraftEntries).length,
  method: "Recipe descriptions use matching native Portuguese spell names or same-item recipe titles and existing recipe prose",
};
provenance.reviewedFrenchPotion = {
  locale: "frFR",
  catalog: "data/client-locale-localization/reviewed-fr-predatory-senses.json",
  reviewedFields: 6,
  method: "Same potion, recipe and spell identities use one reviewed French term and existing native recipe wording",
};
provenance.reviewedFrenchTalents = {
  locale: "frFR",
  catalog: "data/client-locale-localization/reviewed-fr-talent-names.json",
  reviewedEntries: Object.keys(reviewedFrenchTalents.entries).length,
  method: "Client talent names are reviewed against native French spell terms used by the same class",
};
provenance.reviewedGermanTravel = {
  locale: "deDE",
  catalog: "data/client-locale-localization/reviewed-de-travel-spells.json",
  reviewedEntries: Object.values(reviewedGermanTravel.cities).reduce((count, city) =>
    count + city.teleports.length + city.portals.length, 0),
  method: "Mage travel spell destinations use established German World of Warcraft capital names",
};
provenance.reviewedSharedItemDescriptions = {
  catalog: "data/client-locale-localization/reviewed-shared-item-description-gaps.json",
  reviewedItems: Object.keys(reviewedSharedDescriptions.items).length,
  reviewedLockpicks: Object.keys(reviewedSharedDescriptions.lockpicks).length,
  reviewedAreaDescriptions: Object.keys(reviewedSharedDescriptions.areaDescriptions).length,
  reviewedTechnicalDescriptions: 1 +
    Object.keys(reviewedSharedDescriptions.notImplementedKeys.ids).length +
    Object.keys(reviewedSharedDescriptions.invalidLoot.ids).length,
  method: "Authored locale descriptions for app-catalog items with English client text; in-game proper names are checked by exact client key",
};
provenance.reviewedLegacyItemFlavor = {
  catalog: "data/client-locale-localization/reviewed-legacy-item-flavor.json",
  reviewedItems: Object.keys(reviewedLegacyFlavor.items).length,
  method: "Deprecated or unused item flavor text is authored in each locale; inscriptions remain literal and NPC names match the localized map client record",
};
provenance.reviewedChineseLegacy = {
  catalog: "data/client-locale-localization/reviewed-zh-legacy-descriptions.json",
  reviewedDescriptions: reviewedChineseLegacy.cooking.ids.length +
    1 + Object.keys(reviewedChineseLegacy.mounts).length +
    Object.keys(reviewedChineseLegacy.souvenirShirts).length +
    Object.keys(reviewedChineseLegacy.authoredSouvenirShirts).length,
  method: "Old Chinese item descriptions reuse native cooking, conjured item, mount and available mine terms; one unused mine is authored",
};
provenance.reviewedConsumableNames = {
  catalog: "data/client-locale-localization/reviewed-shared-consumable-names.json",
  reviewedItems: Object.keys(reviewedConsumableNames.items).length,
  method: "Authored names for active consumables absent from all client locales, checked against exact item category and icon",
};
const provenanceOutput = JSON.stringify(provenance, null, 2) + "\n";
if (check) {
  if (provenanceOutput !== provenanceRaw) throw new Error("Client locale supplement provenance is stale");
} else if (provenanceOutput !== provenanceRaw) await writeFile(provenancePath, provenanceOutput);
