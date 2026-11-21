/** Localize presentation fields only. Identifiers, source evidence and native records stay literal. */
import en from "./locales/en.json";
type RecordValue = Record<string, unknown>;
type Translate = (english: string, key?: string) => string;
type UiText = (key: string, values?: Record<string, unknown>) => string;
const record = (value: unknown): value is RecordValue => Boolean(value && typeof value === "object" && !Array.isArray(value));
const literalKeys = new Set(["native", "source", "sourcePointer", "source_pointer", "source_sha256", "catalog_pointer", "namespace", "key", "build", "version", "record", "nativeId", "native_item_id", "id", "category", "group", "kind", "icon", "artwork", "assets", "file", "label", "localization_key", "AssetPathName", "SubPathString", "ObjectPath", "ObjectName"]);

export const localizeNativeDocument = <T,>(path: string, data: T, translate: Translate, ui: UiText): T => {
  if (!path.startsWith("data/wiki/") || !record(data)) return data;
  const name = (english: unknown, id?: unknown): unknown => {
    if (typeof english !== "string") return english;
    if (english.startsWith("Loot: ")) return ui("wiki.lootMarkerTitle", { item: translate(english.slice(6)) });
    return translate(english, typeof id === "string" ? `Wiki:${id}:/name` : undefined);
  };
  const target = (value: unknown): unknown => record(value) ? { ...value, name: name(value.name, value.id) } : value;
  const textTree = (value: unknown, id: unknown, pointer: string): unknown => {
    if (typeof value === "string") return /^(?:None|Default:|E\w+::|\/Game\/|\/Script\/|\/PBZ)/.test(value) ? value
      : translate(value, typeof id === "string" ? `Wiki:${id}:${pointer}` : undefined);
    if (Array.isArray(value)) return value.map((child, i) => textTree(child, id, `${pointer}/${i}`));
    if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      literalKeys.has(key) ? child : textTree(child, id, `${pointer}/${key}`)]));
    return value;
  };
  const preview = (value: unknown) => typeof value === "string" ? value.split(" · ").map(part => String(name(part))).join(" · ") : value;
  const entryName = (value: RecordValue) => {
    const labels = en.wiki.markerNames as Record<string, string>;
    if (typeof value.group === "string" && value.name === labels[value.group]) return ui(`wiki.markerNames.${value.group}`);
    if (value.name === en.wiki.containerObject) return ui("wiki.containerObject");
    return name(value.name, value.id);
  };
  const summary = (value: unknown): unknown => record(value) ? { ...value, name: entryName(value),
    ...(value.lootPreview ? { lootPreview: preview(value.lootPreview) } : {}) } : value;
  if (path === "data/wiki/index.json") return { ...data,
    entries: Array.isArray(data.entries) ? data.entries.map(summary) : data.entries,
    itemsByNativeId: record(data.itemsByNativeId) ? Object.fromEntries(Object.entries(data.itemsByNativeId).map(([key, values]) => [key, Array.isArray(values) ? values.map(target) : values])) : data.itemsByNativeId,
  } as T;
  if (path.startsWith("data/wiki/entries/")) {
    const value: RecordValue = { ...data, name: entryName(data) };
    if (Array.isArray(data.descriptions)) value.descriptions = data.descriptions.map((description, i) => record(description)
      ? { ...description, text: textTree(description.text, data.id, `/descriptions/${i}/text`) } : description);
    if (Array.isArray(data.sections)) value.sections = data.sections.map((section, i) => record(section)
      ? { ...section, value: textTree(section.value, data.id, `/sections/${i}/value`) } : section);
    if (record(data.facts)) value.facts = textTree(data.facts, data.id, "/facts");
    if (record(data.quest) && Array.isArray(data.quest.stages)) value.quest = { ...data.quest,
      stages: data.quest.stages.map((stage, i) => record(stage) ? { ...stage,
        title: textTree(stage.title, data.id, `/quest/stages/${i}/title`),
        description: textTree(stage.description, data.id, `/quest/stages/${i}/description`),
      } : stage),
    };
    if (Array.isArray(data.links)) value.links = data.links.map(target);
    if (Array.isArray(data.locations)) value.locations = data.locations.map(location => record(location) ? { ...location, name: name(location.name, data.id) } : location);
    if (Array.isArray(data.regionMaps)) value.regionMaps = data.regionMaps.map(region => record(region) ? { ...region, name: ui(`map.maps.names.${region.mapId}`) } : region);
    for (const field of ["acquisition", "drops", "combatRewards", "sceneAcquisition", "flowRewards", "markerRewards"]) if (Array.isArray(data[field])) value[field] = data[field].map(row => record(row) ? { ...row,
      ...(row.actor ? { actor: target(row.actor) } : {}),
      ...(Array.isArray(row.actors) ? { actors: row.actors.map(target) } : {}),
      ...(Array.isArray(row.items) ? { items: row.items.map(target) } : {}),
    } : row);
    return value as T;
  }
  // Bell guidance and control labels also use the client's original display strings.
  return textTree(data, undefined, "") as T;
};
