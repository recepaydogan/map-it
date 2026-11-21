import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
const chunks = (await readdir(path.join(root, "public/data/reference/quests")))
  .filter((name) => name.endsWith(".json"));
const quests = (await Promise.all(chunks.map((name) => json(`public/data/reference/quests/${name}`))))
  .flatMap((chunk) => Object.values(chunk.entries));
const dungeonChunks = (await readdir(path.join(root, "public/data/reference/dungeons")))
  .filter((name) => name.endsWith(".json"));
const dungeons = new Map((await Promise.all(dungeonChunks.map((name) => json(`public/data/reference/dungeons/${name}`))))
  .flatMap((chunk) => Object.values(chunk.entries)).map((entry) => [entry.id, entry]));

const bundle = await build({
  entryPoints: [path.join(root, "src/features/reference/quest-location-targets.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  define: { "import.meta.env": JSON.stringify({ DEV: true, BASE_URL: "/", VITE_CONTENT_BASE_URL: "https://example.invalid" }) },
});
const { findQuestLocationName, questLocationTargets, questMapDefinitions, questRegionTargets,
  questDungeonTargets, questLinkedDungeonIds, questSourceMapTargets } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const presentationBundle = await build({
  entryPoints: [path.join(root, "src/features/reference/quest-presentation.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  define: { "import.meta.env": JSON.stringify({ DEV: true, BASE_URL: "/", VITE_CONTENT_BASE_URL: "https://example.invalid" }) },
});
const { isInactiveQuestObjectiveText, isUnavailableQuestText, questDisplayObjectives,
  questObjectiveText } = await import(`data:text/javascript;base64,${Buffer.from(
  presentationBundle.outputFiles[0].contents).toString("base64")}`);
const english = await json("src/i18n/locales/en.json");
const translate = (key, options = {}) => {
  const value = key.split(".").reduce((node, part) => node?.[part], english) ?? key;
  return typeof value === "string" ? value.replaceAll("{{name}}", options.name ?? "") : key;
};

const metadata = new Map();
const points = new Map();
const mapIds = new Set([...quests.flatMap((quest) => questMapDefinitions(quest).map((map) => map.id)),
  ...[...dungeons.values()].flatMap((dungeon) => dungeon.locations.map((location) => location.mapId))]);
for (const mapId of mapIds) {
  const data = await json(`public/maps/${mapId}/metadata.json`);
  metadata.set(mapId, data);
  points.set(mapId, new Map(data.locations.map((point) => [point.id, point])));
}

const records = [];
const sourceRecords = [];
const broken = [];
const brokenSourceLinks = [];
const brokenQuestLocations = [];
let questLocations = 0;
const ambiguous = [];
const ambiguousClicked = [];
const collisions = [];
const reviewRows = [];
const missingDirectLinks = [];
const missingDungeonLinks = [];
const invalidDungeonTargets = [];
let reviewedTexts = 0;
for (const quest of quests) {
  for (const location of quest.locations) {
    questLocations++;
    const point = points.get(location.mapId)?.get(location.markerId);
    if (!point || point.name !== location.name.split(" · ").at(-1)) {
      brokenQuestLocations.push({ quest: quest.id, location });
    }
  }
  const maps = questMapDefinitions(quest);
  const dungeonTargets = questDungeonTargets(quest, questLinkedDungeonIds(quest)
    .map((id) => dungeons.get(id)).filter(Boolean));
  for (const target of dungeonTargets) {
    if (!["instance-entrance", "dungeon"].includes(points.get(target.mapId)?.get(target.markerId)?.category)) {
      invalidDungeonTargets.push({ quest: quest.id, target });
    }
  }
  const allRows = quest.sections.filter((section) => section.title === "reference.labels.objectives")
    .flatMap((section) => section.rows ?? []);
  const rows = questDisplayObjectives(allRows);
  const linkedReferenceIds = new Set(allRows.flatMap((row) => row.links ?? [])
    .filter((link) => link.category === "creatures" || link.category === "exploration"
      || link.category === "travel")
    .map((link) => link.id));
  const texts = [quest.description ?? "", ...allRows.map((row) => row.description ?? "")];
  const regionTargets = [];
  const markerCandidates = [];
  for (const map of maps) {
    const data = metadata.get(map.id);
    if (!data) continue;
    const sourceRegions = data.regions.filter((region) => typeof region.id === "string" && typeof region.name === "string"
      && Number.isFinite(region.x) && Number.isFinite(region.y));
    const sourceIds = new Set(sourceRegions.map((region) => region.id));
    regionTargets.push(...questRegionTargets(map, [...sourceRegions,
      ...(map.regionLabels ?? []).filter((region) => !sourceIds.has(region.id))]));
    const named = data.locations.filter((point) => point.reference?.id && typeof point.name === "string");
    const matchingNames = new Set([...new Set(named.map((point) => point.name.trim()))]
      .filter((name) => name.length >= 5 && texts.some((text) => findQuestLocationName(text, name) >= 0)));
    markerCandidates.push(...named.filter((point) => matchingNames.has(point.name.trim())
      || linkedReferenceIds.has(point.reference.id))
      .map((point) => ({ name: point.name, mapId: map.id, markerId: point.id, referenceId: point.reference.id })));
  }
  const textRows = [{ kind: "description", step: 0, text: quest.description ?? "", links: [] },
    ...rows.map((row) => ({ kind: row.name.split(" · ").at(-1), step: Number(row.name.split(" · ")[0]),
      text: questObjectiveText(row, translate, (value) => value), links: row.links ?? [] }))];
  for (const row of textRows) {
    if (!row.text || /^[\s?？.…]+$/u.test(row.text)) continue;
    reviewedTexts++;
    const targets = questLocationTargets(quest, row.links, regionTargets,
      row.step ? { step: row.step, text: row.text } : undefined,
      row.step ? markerCandidates : markerCandidates.filter((marker) => !marker.referenceId.startsWith("NpcData:")),
      dungeonTargets);
    const linkedNames = row.links.filter((link) => link.category !== "creatures" && link.category !== "dungeons"
      && row.text.toLowerCase().includes(link.name.toLowerCase()))
      .map((link) => link.name.toLowerCase());
    const available = row.step ? targets.filter((target) => target.referenceId
      || !linkedNames.some((name) => name.includes(target.name.toLowerCase()))) : targets;
    const recordStart = records.length;
    let rest = row.text;
    while (rest) {
      const matches = available.map((target) => ({ target, index: findQuestLocationName(rest, target.name) }))
        .filter((match) => match.index >= 0).sort((a, b) => a.index - b.index || b.target.name.length - a.target.name.length);
      if (!matches.length) break;
      const { target, index } = matches[0];
      const point = points.get(target.mapId)?.get(target.markerId);
      const region = metadata.get(target.mapId)?.regions.find((item) => `region:${item.id}` === target.markerId);
      const staticRegion = maps.find((map) => map.id === target.mapId)?.regionLabels
        ?.find((item) => `region:${item.id}` === target.markerId);
      if (!point && !region && !staticRegion) broken.push({ quest: quest.id, row, target });
      const record = { quest: quest.id, questName: quest.name, step: row.step, kind: row.kind,
        text: row.text, linkedIds: row.links.map((link) => link.id),
        matched: rest.slice(index, index + target.name.length),
        target, point: point && { name: point.name, category: point.category, referenceId: point.reference?.id,
        x: point.x, y: point.y }, region: region?.name ?? staticRegion?.name };
      records.push(record);
      if (new Set(row.links.filter((link) => link.name.toLowerCase() === target.name.toLowerCase())
        .map((link) => link.id)).size > 1) ambiguousClicked.push(record);
      rest = rest.slice(index + target.name.length);
    }
    const sourceTargets = row.step && !isUnavailableQuestText(row.text) && !isInactiveQuestObjectiveText(row.text)
      ? questSourceMapTargets(row.links, markerCandidates, { questId: quest.id, text: row.text }).filter((source) =>
        !available.some((target) => target.referenceId === source.referenceId
          && findQuestLocationName(row.text, target.name) >= 0)) : [];
    for (const source of sourceTargets) {
      const point = points.get(source.mapId)?.get(source.markerId);
      if (!point || point.reference?.id !== source.referenceId) {
        brokenSourceLinks.push({ quest: quest.id, step: row.step, source });
      }
      sourceRecords.push({ quest: quest.id, step: row.step, source });
    }
    if (row.step) reviewRows.push({ quest: quest.id, questName: quest.name, step: row.step,
      kind: row.kind, text: row.text, sourceLinks: row.links.map((link) => ({ id: link.id, name: link.name })),
      clicked: records.slice(recordStart).map((record) => ({ text: record.matched, target: record.target.markerId })),
      mapSources: sourceTargets.map((source) => ({ name: source.name, referenceId: source.referenceId,
        target: source.markerId })),
      dungeons: quest.sections.filter((section) => section.title === "reference.instanceLayer.questInstances")
        .flatMap((section) => section.links?.map((link) => ({ id: link.id, name: link.name })) ?? []),
    });
    for (const link of row.links) {
      if (link.category !== "creatures" && link.category !== "exploration" && link.category !== "travel") continue;
      if (findQuestLocationName(row.text, link.name) < 0) continue;
      if (new Set(row.links.filter((candidate) => candidate.name.toLowerCase() === link.name.toLowerCase())
        .map((candidate) => candidate.id)).size !== 1) continue;
      if (!markerCandidates.some((candidate) => candidate.referenceId === link.id
        && quest.locations.some((location) => location.mapId === candidate.mapId
          && location.markerId === candidate.markerId))) continue;
      if (!records.slice(recordStart).some((record) => record.target.referenceId === link.id)) {
        missingDirectLinks.push({ quest: quest.id, step: row.step, text: row.text,
          referenceId: link.id, name: link.name });
      }
    }
    for (const target of row.step ? dungeonTargets : []) {
      if (!row.links.some((link) => link.category === "dungeons"
        && link.name.toLowerCase() === target.name.toLowerCase())) continue;
      if (findQuestLocationName(row.text, target.name) < 0) continue;
      if (!records.slice(recordStart).some((record) => record.target.mapId === target.mapId
        && record.target.markerId === target.markerId)) {
        missingDungeonLinks.push({ quest: quest.id, step: row.step, text: row.text, target });
      }
    }
    const byName = Map.groupBy(markerCandidates, (item) => item.name.toLowerCase());
    for (const [name, group] of byName) {
      if (group.length < 2 || findQuestLocationName(row.text, name) < 0) continue;
      if (new Set(group.map((item) => `${item.mapId}:${item.referenceId}`)).size > 1) {
        ambiguous.push({ quest: quest.id, step: row.step, text: row.text, name,
          targets: group.map((item) => ({ mapId: item.mapId, markerId: item.markerId, referenceId: item.referenceId })) });
      } else if (group.length > 1) collisions.push({ quest: quest.id, step: row.step, name, count: group.length });
    }
  }
}

const categories = Object.groupBy(records, (record) => record.point?.category ?? (record.region ? "region" : "missing"));
const referenceMismatches = records.filter((record) => record.point && record.target.referenceId
  && record.target.referenceId !== record.point.referenceId);
const details = process.argv.includes("--details");
const review = process.argv.includes("--review");
console.log(JSON.stringify({ quests: quests.length, objectives: quests.reduce((sum, quest) => sum + quest.sections
  .filter((section) => section.title === "reference.labels.objectives").reduce((n, section) => n + (section.rows?.length ?? 0), 0), 0),
  reviewedTexts, clickableLinks: records.length, sourceMapLinks: sourceRecords.length, questLocations,
  categories: Object.fromEntries(Object.entries(categories)
    .map(([name, list]) => [name, list.length])), broken, brokenSourceLinks, brokenQuestLocations,
  referenceMismatches, ambiguousClicked,
  missingDirectLinks, missingDungeonLinks, invalidDungeonTargets,
  ambiguousGroups: ambiguous.length,
  suspicious: records.filter((record) => record.point?.category === "teleport"
    && /\b(open|enter|door|gate|investigate)\b/iu.test(record.text)
    && record.kind === "Clear Map Event"),
  collisionGroups: collisions.length,
  ...(details && { records, ambiguous }),
  ...(review && { reviewRows }),
}, null, 2));
if (broken.length || brokenSourceLinks.length || brokenQuestLocations.length || referenceMismatches.length
  || ambiguousClicked.length || missingDirectLinks.length || missingDungeonLinks.length
  || invalidDungeonTargets.length) process.exitCode = 1;
