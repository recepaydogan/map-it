import { readFileSync, writeFileSync } from "node:fs";

const base = new URL("../public/data/reference/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", base), "utf8"));
const byId = new Map(index.entries.map((entry) => [entry.id, entry]));
const chunks = new Map();
const mapLocations = new Map();
function readEntry(summary) {
  const path = `${summary.category}/${summary.chunk}.json`;
  if (!chunks.has(path)) chunks.set(path, JSON.parse(readFileSync(new URL(path, base), "utf8")).entries);
  const entry = chunks.get(path)[summary.id];
  if (!entry) throw new Error(`Missing reference entry: ${summary.id}`);
  return entry;
}
function readMapMarker(mapId, markerId) {
  if (!mapLocations.has(mapId)) {
    const map = JSON.parse(readFileSync(new URL(`../public/maps/${mapId}/metadata.json`, import.meta.url), "utf8"));
    mapLocations.set(mapId, new Map(map.locations.map((location) => [location.id, location])));
  }
  const marker = mapLocations.get(mapId).get(markerId);
  if (marker?.category !== "event-entrance") throw new Error(`Missing event entrance marker: ${mapId}/${markerId}`);
  return marker;
}
const entranceCatalog = JSON.parse(readFileSync(new URL("../public/data/event-entrances.json", import.meta.url), "utf8"));
const entrancesByFamily = new Map();
for (const [npcId, entrance] of Object.entries(entranceCatalog.npcs).sort((a, b) =>
  a[1].eventId.localeCompare(b[1].eventId) || a[0].localeCompare(b[0]))) {
  const activity = byId.get(entrance.eventId)?.activity;
  if (!activity?.familyId || activity.listed === false) continue;
  const npc = readEntry(byId.get(`NpcData:${npcId}`));
  const faction = activity.faction;
  if (!faction) throw new Error(`Missing event entrance faction: ${entrance.eventId}`);
  const targets = entrancesByFamily.get(activity.familyId) ?? [];
  for (const location of npc.locations) {
    const marker = readMapMarker(location.mapId, location.markerId);
    const position = `${location.mapId}:${marker.x}:${marker.y}:${faction}`;
    if (!targets.some((target) => target.position === position)) {
      targets.push({ mapId: location.mapId, markerId: location.markerId, faction, name: location.name, position });
    }
  }
  entrancesByFamily.set(activity.familyId, targets);
}
const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const durationSeconds = 30 * 60;
const events = new Map();
for (const summary of index.entries.filter((entry) => entry.id.startsWith("EventSchedule:"))) {
  const schedule = readEntry(summary);
  const weekdays = schedule.sections.find((section) => section.title === "reference.labels.scheduled-days");
  const times = schedule.sections.find((section) => section.title === "reference.labels.client-schedule-times-timezone-unverified");
  if (!weekdays || !times?.text) throw new Error(`Missing schedule fields: ${summary.id}`);
  const activeDays = days.flatMap((day, index) => weekdays.facts.some((fact) => fact.label === `reference.labels.${day}` && fact.value === true) ? [index] : []);
  const minutes = times.text.split(", ").map((time) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Invalid schedule time: ${time}`);
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  });
  for (const link of schedule.sections.flatMap((section) => section.links ?? []).filter((link) => link.category === "activities")) {
    const entry = readEntry(byId.get(link.id));
    if (!entry.activity?.familyId || entry.activity.listed === false || entry.unnamed) continue;
    // Product timing convention: preparation is inside the fixed 30-minute slot.
    // Keep the phase boundary separate from the end; see docs/event-timers.md.
    const seconds = (label) => Number(entry.facts.find((fact) => fact.label === `reference.labels.${label}`)?.value ?? 0);
    const entryWindowSeconds = seconds("preparation-table-units");
    if (!Number.isFinite(entryWindowSeconds) || entryWindowSeconds <= 0) throw new Error(`Missing entry window: ${entry.id}`);
    if (entryWindowSeconds >= durationSeconds) throw new Error(`Preparation exceeds the event slot: ${entry.id}`);
    const id = entry.activity.familyId;
    const existing = events.get(id);
    if (existing) {
      if (JSON.stringify(existing.days) !== JSON.stringify(activeDays) || JSON.stringify(existing.minutes) !== JSON.stringify(minutes)) throw new Error(`Conflicting variant schedules: ${id}`);
      if (existing.entryWindowSeconds !== entryWindowSeconds) throw new Error(`Conflicting variant entry windows: ${id}`);
      continue;
    }
    const entrances = entrancesByFamily.get(id)?.map(({ mapId, markerId, faction, name }) => ({ mapId, markerId, faction, name }));
    const interiorTargets = entrances?.length ? [] : index.entries
      .filter((summary) => summary.category === "dungeons" && summary.group === "Field Event"
        && summary.name === entry.name && summary.adventure?.kind === "other")
      .flatMap((summary) => (readEntry(summary).interiorMaps ?? [])
        .map((interior) => {
          const map = JSON.parse(readFileSync(new URL(`../public/maps/${interior.mapId}/metadata.json`, import.meta.url), "utf8"));
          if (!map.regions.some((region) => region.id === interior.insetId)) throw new Error(`Missing event interior: ${summary.id}`);
          return { mapId: interior.mapId, markerId: `region:${interior.insetId}`,
            faction: summary.adventure.faction.toLowerCase() === "light" ? "light" : "dark" };
        }));
    const mapTargets = entrances?.length ? entrances : interiorTargets;
    events.set(id, { id, name: entry.name, kind: "activity", days: activeDays, minutes, entryWindowSeconds, durationSeconds,
      target: { category: entry.category, id: entry.id, name: entry.name }, ...(mapTargets?.length ? { mapTargets } : {}) });
  }
}
for (const summary of index.entries.filter((entry) => entry.worldBoss?.some((record) => record.schedule))) {
  const entry = readEntry(summary);
  for (const record of entry.worldBoss ?? []) {
    const schedule = record.schedule;
    if (!schedule) continue;
    if (!['Day', 'Cycle'].includes(schedule.kind)) throw new Error(`Unsupported world-boss schedule: ${schedule.id}`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) throw new Error(`Invalid world-boss spawn time: ${schedule.id}`);
    if (!Array.isArray(schedule.days) || !schedule.days.length || schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error(`Invalid world-boss spawn days: ${schedule.id}`);
    if (schedule.kind === 'Cycle' && (!Number.isInteger(schedule.cycle) || schedule.cycle <= 0)) throw new Error(`Invalid world-boss spawn cycle: ${schedule.id}`);
    const [hour, minute] = schedule.time.split(':').map(Number);
    const firstMinute = hour * 60 + minute;
    const minutes = schedule.kind === 'Day' ? [firstMinute] : Array.from(
      { length: Math.ceil((1440 - firstMinute) / schedule.cycle) },
      (_, index) => firstMinute + index * schedule.cycle,
    );
    const id = `world-boss:${schedule.id}`;
    if (events.has(id)) throw new Error(`Duplicate world-boss schedule: ${schedule.id}`);
    const location = entry.locations[0];
    events.set(id, {
      id, name: entry.name, kind: 'world-boss', region: record.region,
      days: schedule.days, minutes, entryWindowSeconds: 0, durationSeconds: 0,
      target: { category: entry.category, id: entry.id, name: entry.name },
      ...(location ? { mapTarget: { mapId: location.mapId, markerId: location.markerId } } : {}),
    });
  }
}
writeFileSync(new URL("../public/data/event-schedule.json", import.meta.url), JSON.stringify([...events.values()].sort((a, b) => a.name.localeCompare(b.name)), null, 2) + "\n");
console.log(`Built ${events.size} event families from bundled reference schedules.`);
