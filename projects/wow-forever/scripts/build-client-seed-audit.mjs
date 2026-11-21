/** Record what the installed client actually supports for each research seed. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const examples = await readJson("docs/marker-research-examples.json");
const db2 = await readJson("data/client-research/local-db2-index.json");
const tableNames = await readJson("data/client-research/db2-table-names.json");
const decodedRows = await readJson("data/client-research/seed-row-matches.json");
const textResources = await readJson("data/client-research/local-text-index.json");
const artwork = await readJson("data/client-research/tracking-icons.json");
const atlasArtwork = await readJson("data/client-research/atlas-icons.json");
const worldMapArtwork = await readJson("data/client-research/world-map-icons.json");
const instanceArtwork = await readJson("data/client-research/instance-artwork.json");
const namedSounds = await readJson("data/client-research/named-sound-clues.json");
const lazyPeons = await readJson("data/client-research/lazy-peons-clues.json");
const questCoverage = await readJson("data/client-research/quest-source-coverage.json");
const alAkethQuest = await readJson("data/client-research/al-aketh-quest-trace.json");
const questPois = await readJson("data/client-research/quest-poi-graph.json");
const published = await readJson("data/client-research/published-marker-evidence.json");
const publishedFlights = await readJson("data/client-research/published-flight-point-evidence.json");
const publishedInstances = await readJson("data/client-research/published-instance-poi-evidence.json");
const instanceLfg = await readJson("data/client-research/instance-lfg-metadata.json");
const instanceFacts = await readJson("data/client-research/published-instance-fact-evidence.json");
const instanceEncounters = await readJson("data/client-research/instance-encounter-trace.json");
const settlementTaxi = await readJson("data/client-research/settlement-taxi-candidates.json");
const battlegrounds = await readJson("data/client-research/battlemaster-map-links.json");
const warsongMap = await readJson("data/client-research/warsong-map-poi-trace.json");
const wailingMapArt = await readJson("data/client-research/wailing-map-art-trace.json");
const wailingPreview = await readJson("data/client-research/wailing-legacy-art-preview.json");
const razorfenMap = await readJson("data/client-research/published-razorfen-map-evidence.json");
const instanceTriggers = await readJson("data/client-research/instance-area-trigger-trace.json");
const kurukShop = await readJson("data/client-research/kuruk-shop-clue.json");
const feathermoonTransport = await readJson("data/client-research/feathermoon-transport-clue.json");
const feathermoonTransportTables = await readJson("data/client-research/feathermoon-transport-table-trace.json");
const feathermoonScenery = await readJson("data/client-research/feathermoon-scenery-trace.json");
const batteredChestItem = await readJson("data/client-research/battered-chest-item.json");
const placedContainerObjects = await readJson("data/client-research/placed-container-object-candidates.json");
const placedContainerModels = await readJson("data/client-research/placed-container-model-clues.json");
const worldObjectModels = await readJson("data/client-research/world-object-model-family.json");
const publishedBoatSigns = await readJson("data/client-research/published-boat-sign-evidence.json");
const publishedTransportStops = await readJson("data/client-research/published-transport-stop-evidence.json");
const publishedServiceSigns = await readJson("data/client-research/published-service-sign-evidence.json");
const publishedThunderBluffSigns = await readJson("data/client-research/published-thunder-bluff-sign-evidence.json");
const publishedZephrasSigns = await readJson("data/client-research/published-zephras-sign-evidence.json");
const publishedWayfinding = await readJson("data/client-research/published-wayfinding-evidence.json");
const worldSignposts = await readJson("data/client-research/world-signpost-relations.json");
const placedServiceModels = await readJson("data/client-research/placed-service-model-clues.json");
const staticTerrainArtwork = await readJson("data/client-research/adt-service-model-clues.json");
const staticTerrainModels = await readJson("data/client-research/adt-mailbox-chest-trace.json");
const wdtMaps = await readJson("data/client-research/wdt-map-identities.json");
const overlayLinks = await readJson("data/client-research/overlay-seed-links.json");
if (db2.source.build !== artwork.source.build
  || db2.source.build !== atlasArtwork.source.build
  || db2.source.build !== worldMapArtwork.source.build
  || db2.source.build !== instanceArtwork.source.build
  || db2.source.build !== namedSounds.source.build
  || db2.source.build !== lazyPeons.source.build
  || db2.source.build !== questCoverage.source.build
  || db2.source.build !== alAkethQuest.source.build
  || db2.source.build !== questPois.source.build
  || db2.source.build !== published.source.build
  || db2.source.build !== publishedFlights.source.build
  || db2.source.build !== publishedInstances.source.build
  || db2.source.build !== instanceLfg.source.build
  || db2.source.build !== instanceFacts.source.build
  || db2.source.build !== instanceEncounters.source.build
  || db2.source.build !== settlementTaxi.source.build
  || db2.source.build !== battlegrounds.source.build
  || db2.source.build !== warsongMap.source.build) {
  throw new Error("The DB2 inventory and icon extraction belong to different client builds.");
}
if (wailingMapArt.source.build !== db2.source.build
  || wailingPreview.source.build !== db2.source.build
  || razorfenMap.source.build !== db2.source.build
  || instanceTriggers.source.build !== db2.source.build) {
  throw new Error("The Wailing Caverns or Razorfen Kraul map research belongs to another client build.");
}
if (kurukShop.source.build !== db2.source.build) {
  throw new Error("The Kuruk shop clue belongs to another client build.");
}
if (feathermoonTransport.source.build !== db2.source.build
  || feathermoonTransportTables.source.build !== db2.source.build
  || feathermoonScenery.source.build !== db2.source.build) {
  throw new Error("The Feathermoon transport clue belongs to another client build.");
}
if (batteredChestItem.source.build !== db2.source.build) {
  throw new Error("The Battered Chest item belongs to another client build.");
}
if (placedContainerObjects.source.build !== db2.source.build
  || placedContainerModels.source.build !== db2.source.build
  || worldObjectModels.source.build !== db2.source.build
  || worldObjectModels.source.gameObjects.sha256 !== placedContainerObjects.source.sha256) {
  throw new Error("The placed container scans belong to another client build.");
}
if (publishedBoatSigns.source.build !== db2.source.build) {
  throw new Error("The boat sign records belong to another client build.");
}
if (publishedTransportStops.source.build !== db2.source.build) {
  throw new Error("The transport stop records belong to another client build.");
}
if (publishedServiceSigns.source.build !== db2.source.build) {
  throw new Error("The service sign records belong to another client build.");
}
if (publishedThunderBluffSigns.source.build !== db2.source.build) {
  throw new Error("The Thunder Bluff sign records belong to another client build.");
}
if (publishedZephrasSigns.source.build !== db2.source.build) {
  throw new Error("The Zephras sign records belong to another client build.");
}
if (publishedWayfinding.source.build !== db2.source.build) {
  throw new Error("The directional sign records belong to another client build.");
}
if (worldSignposts.source.build !== db2.source.build) {
  throw new Error("The world direction signs belong to another client build.");
}
if (placedServiceModels.source.build !== db2.source.build) {
  throw new Error("The placed model scan belongs to another client build.");
}
if (staticTerrainArtwork.source.build !== db2.source.build
  || staticTerrainModels.source.build !== db2.source.build) {
  throw new Error("The static terrain model scan belongs to another client build.");
}
if (wdtMaps.source.build !== db2.source.build
  || overlayLinks.source.build !== db2.source.build) {
  throw new Error("The dungeon terrain or overlay records belong to another client build.");
}
if (decodedRows.source.build !== db2.source.build) {
  throw new Error("Decoded seed row matches belong to another client build.");
}

// These links concern client artwork by type, never the location or identity of a seed.
const trackingIconByOrder = {
  5: "flight-master", 6: "battle-master", 7: "profession", 8: "mailbox",
  12: "innkeeper", 13: "class", 14: "class", 16: "transmogrifier",
  19: "barbershop", 20: "stable-master", 21: "banker", 22: "repair",
  23: "auctioneer",
};
const atlasIconByOrder = { 3: "questnormal", 15: "poi-graveyard-neutral",
  17: "poi-majorcity", 18: "poi-town" };
const worldMapIconByOrder = { 1: "treasure-chest" };
const staticArtworkPatternByOrder = {
  9: /vendor|shop|goods/i, 11: /vault/i, 19: /barber/i,
  20: /stable/i, 21: /bank/i, 23: /auction/i,
};
const icons = new Map(artwork.records.map((record) => [record.name, record]));
const atlasIcons = new Map(atlasArtwork.records.map((record) => [record.name, record]));
const worldMapIcons = new Map(worldMapArtwork.records.map((record) => [record.name, record]));
const publishedByName = new Map(published.markers.map((marker) => [marker.name, marker]));
const flightByName = new Map(publishedFlights.markers.map((marker) => [marker.name, marker]));
const instanceByName = new Map(publishedInstances.markers.map((marker) => [marker.name, marker]));
const taxiBySettlementId = new Map(settlementTaxi.records.map((record) =>
  [record.settlementLocationId, record.candidates]));
const zephrasSignNamesBySeedOrder = {
  12: ["Inn", "Calmbreeze Inn"],
  21: ["Bank and Auction House"],
  23: ["Bank and Auction House"],
};
const nameByFileId = new Map(tableNames.identified.map((record) => [record.fileDataId, record.name]));
const questTables = new Map(questCoverage.tables.map((record) => [record.name, record]));
const questV2 = questTables.get("QuestV2");
const alAkethQuestV2 = alAkethQuest.tables.find(({ name }) => name === "QuestV2");
const alAkethFactionRewards = alAkethQuest.tables.find(({ name }) =>
  name === "QuestFactionReward");
const alAkethItemNames = alAkethQuest.tables.find(({ name }) =>
  name === "ItemSearchName");
const alAkethSpells = alAkethQuest.tables.find(({ name }) => name === "Spell");
const alAkethSpellNames = alAkethQuest.tables.find(({ name }) => name === "SpellName");
const alAkethSpellEffects = alAkethQuest.tables.find(({ name }) => name === "SpellEffect");
const questObjectives = questTables.get("QuestObjective");
const questPoiBlobs = questTables.get("QuestPOIBlob");
const questPoiPoints = questTables.get("QuestPOIPoint");
if (!questV2 || !questObjectives || !questPoiBlobs || !questPoiPoints
  || !alAkethQuestV2 || !alAkethFactionRewards || !alAkethItemNames
  || !alAkethSpells || !alAkethSpellNames || !alAkethSpellEffects) {
  throw new Error("Missing required quest source coverage.");
}
const waypointSafeLocs = tableNames.identified.find(({ name }) => name === "WaypointSafeLocs");
const waypointSafeLocsInventory = db2.inventory.find(({ fileDataId }) =>
  fileDataId === waypointSafeLocs?.fileDataId);
if (!waypointSafeLocs || !waypointSafeLocsInventory) {
  throw new Error("Missing WaypointSafeLocs client table inventory.");
}
const records = examples.examples.map((seed) => {
  const name = seed.name.toLowerCase();
  const rawStringMatches = db2.matches
    .filter((file) => file.terms.some((term) => term.toLowerCase() === name))
    .map((file) => ({ fileDataId: file.fileDataId,
      table: nameByFileId.get(file.fileDataId) ?? null }));
  const textResourceNameMatches = textResources.matches
    .filter((file) => file.terms.some((term) => term.toLowerCase() === name))
    .map(({ fileDataId, contentFlags }) => ({ fileDataId, contentFlags }));
  const iconName = trackingIconByOrder[seed.order];
  const icon = iconName ? icons.get(iconName) : undefined;
  if (iconName && !icon) throw new Error(`Missing extracted tracking icon ${iconName}.`);
  const atlasIconName = atlasIconByOrder[seed.order];
  const atlasIcon = atlasIconName ? atlasIcons.get(atlasIconName) : undefined;
  if (atlasIconName && !atlasIcon) throw new Error(`Missing extracted atlas icon ${atlasIconName}.`);
  const worldMapIconName = worldMapIconByOrder[seed.order];
  const worldMapIcon = worldMapIconName ? worldMapIcons.get(worldMapIconName) : undefined;
  if (worldMapIconName && !worldMapIcon) throw new Error(`Missing extracted world-map icon ${worldMapIconName}.`);
  const publishedMarker = publishedByName.get(seed.name);
  const flightMarker = flightByName.get(seed.name);
  const instanceMarker = instanceByName.get(seed.name);
  return {
    order: seed.order, seedName: seed.name, seedCategory: seed.category,
    mapCategoryId: seed.mapCategoryId,
    verifiedEntityId: flightMarker ? `TaxiNodes:${flightMarker.taxiNodeId}`
      : instanceMarker ? `AreaPOI:${instanceMarker.poiId}`
        : seed.order === 4 ? "TaxiPath:303" : null,
    verifiedLocations: [
      ...(publishedMarker ? [{ locationId: publishedMarker.locationId,
        atlasPosition: publishedMarker.atlasPosition,
        placementRule: publishedMarker.placementRule }] : []),
      ...(flightMarker ? [{ locationId: flightMarker.locationId,
        atlasPosition: flightMarker.atlasPosition,
        placementRule: "Exact client TaxiNodes position corroborated by route endpoints." }] : []),
      ...(instanceMarker ? [{ locationId: instanceMarker.locationId,
        atlasPosition: instanceMarker.atlasPosition,
        placementRule: publishedInstances.placementRule }] : []),
      ...(seed.order === 4 ? publishedTransportStops.markers
        .filter(({ pathId }) => pathId === 303)
        .map(({ locationId, atlasPosition }) => ({ locationId, atlasPosition,
          placementRule: "Pause-like TaxiPathNode position on the Feathermoon–Feralas route." })) : []),
    ],
    verifiedRelations: [
      ...(publishedMarker ? [publishedMarker.sourceIds] : []),
      ...(flightMarker ? [{ taxiNodeId: flightMarker.taxiNodeId,
        routePathIds: flightMarker.routePathIds,
        outgoingTaxiNodeIds: flightMarker.outgoingTaxiNodeIds }] : []),
      ...(instanceMarker ? [{ poiId: instanceMarker.poiId,
        instanceMapId: instanceMarker.instanceMapId,
        areaId: instanceMarker.areaId,
        parentAreaId: instanceMarker.parentAreaId }] : []),
      ...(seed.order === 4 ? [{ pathId: 303,
        stopLocationIds: publishedTransportStops.markers
          .filter(({ pathId }) => pathId === 303)
          .map(({ locationId }) => locationId) }] : []),
    ],
    spatialTaxiClues: publishedMarker
      ? taxiBySettlementId.get(publishedMarker.locationId) ?? [] : [],
    clientTrackingIcon: icon ? { fileDataId: icon.fileDataId, path: icon.path,
      basis: "matching-client-tracking-type" } : null,
    clientAtlasIcon: atlasIcon ? { textureFileDataId: atlasIcon.textureFileDataId,
      memberId: atlasIcon.memberId, path: atlasIcon.path,
      basis: "matching-client-map-glyph-type" } : null,
    clientWorldMapIcon: worldMapIcon ? { fileDataId: worldMapIcon.fileDataId,
      path: worldMapIcon.path, basis: "matching-client-treasure-type" } : null,
    clientItemIcon: seed.order === 1 ? { ...batteredChestItem.icon,
      basis: "exact-client-item-record-not-a-world-spawn" } : null,
    clientInstanceArtwork: instanceArtwork.records
      .filter(({ instanceName }) => instanceName === seed.name)
      .map(({ fileDataId, path, kind }) => ({
        fileDataId, path, kind, basis: "exact-name-client-interface-path" })),
    clientInstanceLfgRows: instanceLfg.records.find(({ name }) => name === seed.name)
      ?.exactNameLfgRows ?? [],
    clientInstanceFacts: instanceFacts.records.find(({ name }) => name === seed.name)
      ?.publishedFacts ?? null,
    clientInstanceEncounters: instanceEncounters.records.find(({ name }) => name === seed.name)
      ?.encounters ?? [],
    namedAmbientClues: namedSounds.records.filter(({ seedName }) => seedName === seed.name)
      .map(({ id, mapId, worldPosition, atlasPosition, sourceName }) => ({
        id, mapId, worldPosition, atlasPosition, sourceName,
        basis: "named-client-sound-emitter-not-marker-position" })),
    localQuestIdClues: seed.name === lazyPeons.seedName ? lazyPeons.clues : [],
    localQuestPoiClues: seed.name === lazyPeons.seedName
      ? questPois.quests.filter(({ questId }) =>
        lazyPeons.clues.some((clue) => clue.questId === questId))
        .map(({ id, questId, mapFieldRaw, points }) => ({
          poiBlobId: id, questId, mapFieldRaw,
          poiPointIds: points.map((point) => point.id),
          basis: "objective-geometry-not-quest-giver-position",
        })) : [],
    clientQuestTableCoverage: seed.order === 2 || seed.order === 3 ? {
      readableQuestV2Rows: questV2.readableRows,
      readableQuestV2TitleFields: questV2.readableStringFields,
      encryptedQuestV2Rows: questV2.omittedSections
        .reduce((sum, section) => sum + section.recordCount, 0),
      readableObjectiveRows: questObjectives.readableRows,
      readableQuestPoiBlobs: questPoiBlobs.readableRows,
      readableQuestPoiPoints: questPoiPoints.readableRows,
      basis: "client-table-coverage-not-quest-identity-or-giver-placement",
    } : null,
    sameCategoryPlacedSigns: seed.order === 4
      ? publishedBoatSigns.markers.map(({ locationId, names, signObjectIds }) => ({
        locationId, names, signObjectIds,
        basis: "separate-placed-boat-sign-family-not-feathermoon-transport" })) : [],
    relatedPlacedSigns: [
      ...(seed.order === 9 || seed.order === 21
        ? publishedServiceSigns.markers
        .filter(({ category }) => category === (seed.order === 9 ? "shop-sign" : "bank-sign"))
        .map((marker) => ({ ...marker,
          basis: "placed-service-sign-not-a-verified-service-npc" })) : []),
      ...(seed.order === 7 || seed.order === 13
        ? publishedThunderBluffSigns.signs
          .filter(({ name }) => name === (seed.order === 7
            ? "Stonehoof Geology" : "Hunter's Hall"))
          .map(({ locationId, objectId, name, atlasPosition, modelNameHints }) => ({
            locationId, objectId, name, atlasPosition, modelNameHints,
            basis: "placed-venue-sign-not-a-verified-trainer-npc",
          })) : []),
      ...(seed.searchActorNames ?? []).flatMap((actor) => {
        const surname = actor.toLowerCase().trim().split(/\s+/).at(-1);
        if (!surname || surname.length < 5) return [];
        return publishedThunderBluffSigns.signs
          .filter(({ name }) => name.toLowerCase().split(/[^a-z]+/).includes(surname))
          .map(({ locationId, objectId, name, atlasPosition, modelNameHints }) => ({
            locationId, objectId, name, atlasPosition, modelNameHints,
            actorSearchClue: actor,
            basis: "shared-actor-surname-in-placed-venue-sign-not-a-verified-npc-or-service",
          }));
      }),
    ],
    relatedZephrasWayfindingSigns: publishedZephrasSigns.markers
      .filter(({ name }) => zephrasSignNamesBySeedOrder[seed.order]?.includes(name))
      .map(({ locationId, objectId, name, mapId, atlasPosition, iconFileDataId }) => ({
        locationId, objectId, name, mapId, atlasPosition, iconFileDataId,
        basis: "placed-wayfinding-sign-not-a-verified-service-npc",
      })),
    relatedDirectionalSigns: [
      ...(seed.order === 4
        ? worldSignposts.signposts.filter(({ destinations }) => destinations.some(({ name }) =>
          name === "Feathermoon Stronghold")).map(({ signpostId, mapId, atlasPosition,
          members }) => ({ locationId: signpostId, mapId, atlasPosition,
          objectIds: members.map(({ objectId }) => objectId),
          basis: "placed-direction-sign-to-stronghold-not-a-verified-boat-service" })) : []),
      ...(seed.order === 12 ? publishedWayfinding.signs
        .filter(({ name }) => name === "Shady Rest Inn")
        .map(({ locationId, objectId, name, mapId, atlasPosition,
          exactNameAreaPoiId }) => ({ locationId, objectId, name, mapId,
          atlasPosition, exactNameAreaPoiId,
          basis: "placed-inn-direction-sign-not-a-verified-innkeeper" })) : []),
    ],
    placedModelClues: seed.order === 20 || seed.order === 21
      ? placedServiceModels.records
        .filter(({ modelNameHints }) => modelNameHints.some((hint) =>
          new RegExp(seed.order === 20 ? "stable" : "bank", "i").test(hint)))
        .map(({ objectId, mapId, atlasPosition, displayId, modelFileDataId,
          modelNameHints }) => ({ objectId, mapId, atlasPosition, displayId,
          modelFileDataId, modelNameHints,
          basis: "placed-artwork-not-a-verified-service-npc" })) : [],
    staticTerrainModelClues: seed.order === 1 || seed.order === 8
      ? staticTerrainModels.models
        .filter(({ matchingStrings }) => matchingStrings.some((value) =>
          new RegExp(seed.order === 1 ? "chest|coffer|treasure" : "mailbox", "i").test(value)))
        .map(({ fileDataId, expectedPlacements, matchingStrings,
          gameObjectDisplayIds, clientPlacedObjectIds }) => ({
          fileDataId, expectedPlacements, matchingStrings,
          gameObjectDisplayIds, clientPlacedObjectIds,
          atlasPositions: staticTerrainModels.placements
            .filter(({ modelFileDataId }) => modelFileDataId === fileDataId)
            .map(({ mapId, atlasPosition }) => ({ mapId, ...atlasPosition })),
          basis: "static-ADT-artwork-not-a-verified-interactive-object-or-service",
        })) : [],
    staticTerrainArtworkClues: staticArtworkPatternByOrder[seed.order]
      ? staticTerrainArtwork.candidates
        .filter(({ matchingStrings }) => matchingStrings.some((value) =>
          staticArtworkPatternByOrder[seed.order].test(value)))
        .map(({ kind, fileDataId, placements, matchingStrings }) => ({
          kind, fileDataId, placements, matchingStrings,
          basis: "static-ADT-artwork-not-a-verified-service",
        })) : [],
    relatedDungeonMap: seed.order === 15 ? (() => {
      const record = wdtMaps.records.find(({ wdtFileDataId }) => wdtFileDataId === 790640);
      const map = record?.maps.find(({ mapId }) => mapId === 47);
      if (!map || map.name !== seed.name) throw new Error("Missing Razorfen Kraul dungeon map join.");
      if (razorfenMap.source.mapId !== map.mapId
        || razorfenMap.nativeTileCount !== record.tileCount) {
        throw new Error("Published Razorfen terrain differs from its Map record.");
      }
      return { mapId: 47, wdtFileDataId: 790640, nativeTileCount: record.tileCount,
        selectableMapId: "razorfen-kraul",
        basis: "complete-client-Map-and-WDT-join-not-a-graveyard-position" };
    })() : null,
    relatedMapArtCoverage: seed.order === 10 ? {
      mapId: wailingMapArt.map.id,
      wdtFileDataId: wailingMapArt.map.wdtFileDataId,
      nativeMinimapTileCount: wailingMapArt.map.wdtStatus.nativeMinimapTileCount,
      namedLegacyTextureCount: wailingMapArt.expectedTiles.length,
      composedLegacyPreview: wailingPreview.tiles.length === 12
        && wailingPreview.tiles.every(({ fileDataId }) =>
          wailingMapArt.expectedTiles.some((tile) => tile.fileDataId === fileDataId)),
      activeUiMapAssignmentCount: wailingMapArt.assignedUiMaps.length,
      namedArtTileJoinCount: wailingMapArt.namedTextureRows.length,
      basis: "named-legacy-art-without-active-client-map-join",
    } : null,
    relatedAreaTriggerCoverage: seed.order === 10 || seed.order === 15 ? {
      instanceMapId: seed.order === 10 ? 43 : 47,
      positionedInteriorTriggerIds: instanceTriggers.matches
        .filter(({ relationshipId }) => relationshipId === (seed.order === 10 ? 43 : 47))
        .map(({ id }) => id),
      ...(seed.order === 10 ? { nearestWorldTriggerDistanceToPoi:
        instanceTriggers.nearbyWailingWorldTriggers[0]?.distanceToPoi ?? null } : {}),
      directActionOrCreatePropertiesJoins: instanceTriggers.associatedRows
        .reduce((count, table) => count + table.rows.length, 0),
      basis: "positioned-client-area-triggers-without-verified-entrance-or-graveyard-function",
    } : null,
    relatedBattlegroundMap: seed.order === 6 ? {
      mapId: warsongMap.source.mapId,
      wdtFileDataId: warsongMap.source.wdtFileDataId,
      nativeTileCount: warsongMap.source.nativeTileCount,
      areaPoiCount: warsongMap.pois.length,
      placedObjectCount: warsongMap.objects.length,
      basis: "BattlemasterList-to-Map-to-WDT-join-not-an-Elfarran-position",
    } : null,
    localGraveyardTableCoverage: seed.order === 15 ? {
      worldSafeLocsRegistered: tableNames.identified.some(({ name }) => name === "WorldSafeLocs"),
      waypointSafeLocsFileDataId: waypointSafeLocs.fileDataId,
      waypointSafeLocsReadableRows: waypointSafeLocsInventory.rowCount,
      basis: "client-table-registration-and-local-row-count-not-graveyard-placement",
    } : null,
    legacyOverlayClues: seed.order === 15
      ? overlayLinks.links.find(({ seedName }) => seedName === seed.name)
        ?.positionedOverlayTiles.map(({ id, overlayId, overlayMapField, activeUiMapLinks }) => ({
          tileId: id, overlayId, mapArtId: overlayMapField,
          activeUiMapLinkCount: activeUiMapLinks.length,
          basis: "named-overlay-art-without-current-world-map-placement" })) ?? [] : [],
    localRelationalClues: seed.order === 1
      ? { itemId: batteredChestItem.item.itemId,
        linkedItemEffects: batteredChestItem.relationScan.linkedItemEffects,
        exactNamePlacedObjects: batteredChestItem.relationScan.exactNamePlacedObjects,
        placedContainerNameCandidates: placedContainerObjects.records.length,
        placedChestModelCandidates: placedContainerModels.records.filter(({ modelNameHints }) =>
          modelNameHints.some((hint) => /chest|coffer|cache|strongbox|lockbox|treasure/i.test(hint))).length,
        placedCrateOrBarrelModels: placedContainerModels.records.filter(({ modelNameHints }) =>
          modelNameHints.some((hint) => /crate|barrel/i.test(hint))).length,
        worldPlacedObjectCount: worldObjectModels.placedWorldObjects,
        worldObjectDisplayModelCount: worldObjectModels.distinctDisplayModels,
        chestNamedWorldDisplayModelCount: worldObjectModels.chestNamedModelCount,
        source: "ItemSparse, Item, ItemXItemEffect, GameObjects, and placed display models; no world chest spawn verified" }
      : seed.order === 2 ? {
        factionId: 2749,
        rawQuestV2NumberMatches: alAkethQuestV2.selectedRows
          .filter(({ sameNumberAsFactionId }) => sameNumberAsFactionId)
          .map(({ id }) => id),
        questV2SecondFieldFactionIdOverlap: alAkethQuestV2.secondFieldProfile.valuesAlsoFactionIds,
        questV2NearbyRows: alAkethQuestV2.secondFieldProfile.nearbyQuestIds,
        readableQuestFactionRewardRows: alAkethFactionRewards.readableRows,
        namedEarItemRows: alAkethItemNames.selectedRows.filter(({ matchingNames }) =>
          matchingNames?.some((value) => /\bear(s)?\b/i.test(value))).length,
        namedMarkOfAkirSpellId: alAkethSpellNames.selectedRows.find(({ id }) =>
          id === 1254832)?.id ?? null,
        markOfAkirTextMentionsAlAketh: alAkethSpells.selectedRows.some(({ id, matchingNames }) =>
          id === 1254832 && matchingNames?.some((value) => /al.?aketh/i.test(value))),
        directlyLinkedMarkOfAkirEffects: alAkethSpellEffects.selectedRows
          .filter(({ relationshipId }) => relationshipId === 1254832)
          .map(({ id }) => id),
        basis: "spell-text-and-effect-relationships-identify-a-buff-not-a-quest; raw-number-overlap-is-not-a-faction-reward-join",
      }
      : seed.name === lazyPeons.seedName
      ? lazyPeons.relatedLocalIds
      : seed.order === 4 ? { transport: feathermoonTransport.transport,
        routeIds: feathermoonTransport.paths.map(({ pathId }) => pathId),
        publishedRouteStops: publishedTransportStops.markers
          .filter(({ pathId }) => pathId === 303)
          .map(({ locationId, sequence, mapId, worldPosition, rawFields }) => ({
            locationId, sequence, mapId, worldPosition, rawFields,
            basis: "pause-like-client-route-node-not-a-verified-active-service",
          })),
        nearbyStaticBoatOrDockModels: feathermoonScenery.nearFeathermoon
          .map(({ kind, fileDataId, modelStrings, distances }) => ({
            kind, fileDataId, modelStrings, distances,
            basis: "static-ADT-scenery-not-an-active-boat-or-boarding-point",
          })),
        transportTableTrace: {
          tables: feathermoonTransportTables.tables.map(({ name, rowCount,
            omittedSections, matches }) => ({ name, rowCount,
            omittedSectionCount: omittedSections.length, rawTaxiIdMatchCount: matches.length })),
          placedObjectJoinCount: feathermoonTransportTables.placedObjectJoin.matchingRows.length,
          displayInfoJoinCount: feathermoonTransportTables.displayInfoJoin.matchingRows.length,
          basis: "no-verified-feathermoon-dock-or-boat-model-join",
        },
        routeGeometry: feathermoonTransport.paths.map(({ pathId, routeNodeCount,
          repeatedWaypointPairs, allWaypointAltitudesZero }) => ({
          pathId, routeNodeCount, repeatedWaypointPairs,
          allWaypointAltitudesZero,
          basis: "repeated-client-waypoints-and-pause-like-nodes-identify-route-stops-not-active-service",
        })) }
      : seed.order === 6 ? battlegrounds.links.filter(({ battlegroundName }) =>
        battlegroundName === "Warsong Gulch")
        : seed.order === 9 ? kurukShop.records : null,
    rawNameStringMatches: rawStringMatches,
    decodedRowMatches: decodedRows.matches.filter(({ seedOrder }) => seedOrder === seed.order),
    distinctiveRowMatches: decodedRows.distinctiveMatches.filter(({ seedOrder }) =>
      seedOrder === seed.order),
    textResourceNameMatches,
    rawNameMatchIsEntityEvidence: false,
  };
});
const output = join(root, "data/client-research/seed-audit.json");
await writeFile(output, `${JSON.stringify({ source: {
  product: db2.source.product, build: db2.source.build,
  db2FileCount: db2.scanned, iconPathTableFileDataId: artwork.source.pathTableFileDataId,
  placedObjectModelScan: { placedObjects: placedServiceModels.placedObjects,
    distinctDisplayModels: placedServiceModels.distinctDisplayModels },
  placedWorldObjectModelScan: { placedObjects: worldObjectModels.placedWorldObjects,
    distinctDisplayModels: worldObjectModels.distinctDisplayModels,
    signpostPointers: worldObjectModels.signpostPointerCount,
    taurenVenueSigns: worldObjectModels.taurenVenueSignCount,
    chestNamedModels: worldObjectModels.chestNamedModelCount },
  staticTerrainModelScan: { source: "Kalimdor-and-Eastern-Kingdoms-object-ADTs",
    mailboxOrChestModels: staticTerrainModels.models.length,
    placements: staticTerrainModels.placements.length },
}, evidenceRule: "Raw strings and tracking artwork do not establish entity identity, map position, or loot.",
records }, null, 2)}\n`);
console.log(`Audited ${records.length} research seeds: ${output}`);
