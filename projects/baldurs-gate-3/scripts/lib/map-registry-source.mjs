const MAP_DEFINITIONS_START = "export const MAP_DEFINITIONS";
const MAP_ATLASES_START = "export const MAP_ATLASES";

/** Extract map ids only from MAP_DEFINITIONS. Other registry sections can
 * also contain `id` fields and must never be treated as public map folders. */
export const readRegisteredMapIds = (registrySource) => {
  const definitionsStart = registrySource.indexOf(MAP_DEFINITIONS_START);
  const atlasesStart = registrySource.indexOf(MAP_ATLASES_START, definitionsStart);
  if (definitionsStart < 0 || atlasesStart < 0) {
    throw new Error("Could not isolate MAP_DEFINITIONS in map-registry.ts.");
  }
  const definitionsSource = registrySource.slice(definitionsStart, atlasesStart);
  const mapIds = [...definitionsSource.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)]
    .map((match) => match[1]);
  if (mapIds.length === 0) throw new Error("No map ids were found in map-registry.ts.");
  return mapIds;
};
