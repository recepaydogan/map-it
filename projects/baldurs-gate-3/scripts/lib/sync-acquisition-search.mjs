import fs from "node:fs";
import path from "node:path";
import { findUniqueEquipmentClass } from "./unique-equipment.mjs";
import { writeGeneratedFile } from "./write-generated-file.mjs";

const collect = (items) => {
  const byMap = new Map();
  for (const item of items) {
    const equipmentClass = findUniqueEquipmentClass({ type: item.type, rarity: item.rarity, ...item.gameplay });
    if (!equipmentClass) continue;
    for (const acquisition of item.acquisitions ?? []) {
      if (!acquisition.mapId || !acquisition.locationId) continue;
      if (!byMap.has(acquisition.mapId)) byMap.set(acquisition.mapId, new Map());
      const locations = byMap.get(acquisition.mapId);
      if (!locations.has(acquisition.locationId)) locations.set(acquisition.locationId, { terms: new Set(), facets: new Set() });
      const entry = locations.get(acquisition.locationId);
      for (const term of [item.name, ...Object.values(item.localizedNames ?? {}), item.statsId, item.rarity]) if (term) entry.terms.add(term);
      entry.facets.add(`unique-${equipmentClass}`);
    }
  }
  return byMap;
};

// Reconcile item-derived metadata after acquisitions change. A stock correction
// must not leave old item names searchable at its former vendor location.
// Geometry, marker identity and non-item facets are not regenerated here.
export const syncAcquisitionSearch = (previousItems, currentItems, mapsRoot) => {
  const before = collect(previousItems), after = collect(currentItems);
  const pending = [];
  let changedLocations = 0;
  for (const mapId of new Set([...before.keys(), ...after.keys()])) {
    if (!/^[a-z0-9-]+$/.test(mapId)) throw new Error(`Invalid acquisition map ID: ${mapId}`);
    const filename = path.join(mapsRoot, mapId, "locations.json");
    if (!fs.existsSync(filename)) throw new Error(`Acquisition references unavailable map ${mapId}`);
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    let changed = false;
    const locations = data.locations.map((location) => {
      const old = before.get(mapId)?.get(location.id) ?? { terms: new Set(), facets: new Set() };
      const next = after.get(mapId)?.get(location.id) ?? { terms: new Set(), facets: new Set() };
      const equal = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));
      if (equal(old.terms, next.terms) && equal(old.facets, next.facets)) return location;
      const searchTerms = [...new Set([...(location.searchTerms ?? []).filter((term) => !old.terms.has(term) || next.terms.has(term)), ...next.terms])];
      const categoryFacets = [...new Set([...(location.categoryFacets ?? []).filter((facet) => !old.facets.has(facet) || next.facets.has(facet)), ...next.facets])];
      changed = true;
      changedLocations += 1;
      return { ...location, searchTerms, categoryFacets };
    });
    if (changed) pending.push({ filename, content: `${JSON.stringify({ ...data, locations }, null, 2)}\n` });
  }
  for (const { filename, content } of pending) writeGeneratedFile(filename, content);
  return { changedLocations, changedMaps: pending.length };
};
