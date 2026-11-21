import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventCountdown, nextOccurrence, occurrencesInWindow, reminderKey } from "../src/features/events/event-schedule.ts";
import { EVENT_SERVER_REGIONS } from "../src/game-config.ts";
import { eventServerTimeZone } from "../src/features/events/event-server-region.ts";
import { activeMapEvents, WORLD_BOSS_SPAWN_CUE_MS } from "../src/features/events/active-map-events.ts";

const mapEvent = { id: "map-event", name: "Map event", kind: "activity", days: [1], minutes: [720],
  entryWindowSeconds: 180, durationSeconds: 1800,
  mapTargets: [{ mapId: "world-l-a", markerId: "entrance-a" }, { mapId: "world-d-a", markerId: "entrance-b" }] };
const bossSpawn = { ...mapEvent, id: "boss-spawn", kind: "world-boss", durationSeconds: 0, entryWindowSeconds: 0,
  mapTargets: undefined, mapTarget: { mapId: "world-l-a", markerId: "boss-a" } };
const mapEventStart = Date.parse("2026-10-05T12:00:00Z");
assert.equal(activeMapEvents([mapEvent], "world-l-a", mapEventStart - 1, "UTC").byMarkerId.size, 0);
assert.equal(activeMapEvents([mapEvent], "world-l-a", mapEventStart - 1, "UTC").nextChangeAt, mapEventStart);
assert.deepEqual(activeMapEvents([mapEvent, bossSpawn], "world-l-a", mapEventStart, "UTC").byMarkerId.get("entrance-a"), [mapEvent]);
assert.equal(activeMapEvents([bossSpawn], "world-l-a", mapEventStart - 1, "UTC").byMarkerId.size, 0);
assert.deepEqual(activeMapEvents([bossSpawn], "world-l-a", mapEventStart, "UTC").byMarkerId.get("boss-a"), [bossSpawn]);
assert.equal(activeMapEvents([bossSpawn], "world-l-a", mapEventStart, "UTC").nextChangeAt, mapEventStart + WORLD_BOSS_SPAWN_CUE_MS);
assert.equal(activeMapEvents([bossSpawn], "world-l-a", mapEventStart + WORLD_BOSS_SPAWN_CUE_MS, "UTC").byMarkerId.size, 0);
assert.equal(activeMapEvents([mapEvent], "world-l-a", mapEventStart, "UTC").nextChangeAt, mapEventStart + 1_800_000);
assert.deepEqual(activeMapEvents([mapEvent], "world-d-a", mapEventStart, "UTC").byMarkerId.get("entrance-b"), [mapEvent]);
assert.equal(activeMapEvents([mapEvent], "world-l-a", mapEventStart + 1_800_000, "UTC").byMarkerId.size, 0);
assert.equal(activeMapEvents([mapEvent], "world-l-a", mapEventStart, null).byMarkerId.size, 0);

const expectedRegionStarts = {
  eu: "2026-10-05T19:00:00.000Z",
  la: "2026-10-06T00:00:00.000Z",
  nae: "2026-10-06T01:00:00.000Z",
  naw: "2026-10-06T04:00:00.000Z",
  as: "2026-10-05T12:00:00.000Z",
};
const regionEvent = { id: "region", name: "Region event", kind: "activity", days: [1], minutes: [21 * 60], entryWindowSeconds: 0, durationSeconds: 0 };
for (const region of EVENT_SERVER_REGIONS) {
  assert.equal(eventServerTimeZone(region.key), region.timeZone);
  assert.equal(new Date(nextOccurrence(regionEvent, Date.parse("2026-10-05T00:00:00Z"), region.timeZone).start).toISOString(), expectedRegionStarts[region.key]);
}
assert.equal(eventServerTimeZone(null), null);

const weekly = { id: "weekly", name: "Weekly event", kind: "activity", days: [3], minutes: [60], entryWindowSeconds: 600, durationSeconds: 600 };
const start = Date.parse("2026-09-22T17:00:00Z"); // Wednesday 01:00 at UTC+8.
assert.equal(nextOccurrence(weekly, start - 1000, "Asia/Taipei").start, start);
assert.equal(nextOccurrence(weekly, start, "Asia/Taipei").active, true);
assert.equal(nextOccurrence(weekly, start + 599_999, "Asia/Taipei").active, true);
assert.equal(nextOccurrence(weekly, start + 600_000, "Asia/Taipei").active, false);
assert.equal(nextOccurrence(weekly, start + 600_000, "Asia/Taipei").start, start + 7 * 86_400_000);
assert.equal(nextOccurrence(weekly, start - 3_600_001, "Asia/Seoul").start, start - 3_600_000);
assert.equal(nextOccurrence({ ...weekly, days: [] }, start, "Asia/Taipei"), null);
assert.equal(nextOccurrence({ ...weekly, minutes: [] }, start, "Asia/Taipei"), null);
const daily = { ...weekly, days: [0, 1, 2, 3, 4, 5, 6], minutes: [0] };
const midnight = Date.parse("2026-09-19T16:00:00Z");
assert.equal(nextOccurrence(daily, midnight - 1, "Asia/Taipei").start, midnight);
assert.equal(nextOccurrence(daily, midnight + 120_000, "Asia/Taipei").start, midnight);
assert.equal(nextOccurrence(daily, midnight + 120_000, "Asia/Taipei").nextStart, midnight + 86_400_000);
assert.equal(eventCountdown(59_001), "01:00");
assert.equal(eventCountdown(3_661_000), "01:01:01");
assert.equal(eventCountdown(-1000), "00:00");
const occurrence = nextOccurrence(daily, midnight - 1000, "Asia/Taipei");
assert.notEqual(reminderKey(occurrence, "Asia/Taipei"), reminderKey(occurrence, "Asia/Seoul"));
assert.notEqual(reminderKey(occurrence, "Asia/Taipei"), reminderKey(nextOccurrence(daily, midnight, "Asia/Taipei"), "Asia/Taipei"));

const hour = 3_600_000;
const hourly = { ...daily, minutes: Array.from({ length: 24 }, (_, index) => index * 60) };
const windowNow = midnight - hour + 120_000;
const timeline = occurrencesInWindow(hourly, windowNow, windowNow + 12 * hour, "Asia/Taipei");
assert.equal(timeline.length, 13, "Keep the ongoing run and all twelve upcoming repeats");
assert.equal(timeline[0].start, midnight - hour);
assert.equal(timeline[0].active, true);
assert.equal(timeline[0].entryOpen, true);
assert.equal(timeline[0].nextStart, midnight);
assert.deepEqual(timeline.slice(1).map((run) => run.start), Array.from({ length: 12 }, (_, index) => midnight + index * hour));
assert.ok(timeline.slice(1).every((run) => !run.active && !run.entryOpen && run.nextStart === run.start));
assert.equal(occurrencesInWindow(hourly, midnight, midnight + 12 * hour, "Asia/Taipei").at(-1).start, midnight + 12 * hour, "Include starts exactly at the horizon");
assert.equal(occurrencesInWindow(hourly, midnight + 600_000, midnight + 12 * hour, "Asia/Taipei")[0].start, midnight + hour, "Remove runs exactly when they end");
assert.deepEqual(occurrencesInWindow(weekly, start + 600_000, start + 12 * hour, "Asia/Taipei"), [], "Do not show next week's run outside the horizon");
assert.equal(occurrencesInWindow(weekly, start, start + 12 * hour, "Asia/Taipei")[0].nextStart, start + 7 * 86_400_000);
assert.equal(occurrencesInWindow(weekly, start - 2 * hour, start + 12 * hour, "Asia/Seoul")[0].start, start - hour, "Apply the calendar zone offset");
assert.deepEqual(occurrencesInWindow({ ...daily, days: [] }, midnight, midnight + 12 * hour, "Asia/Taipei"), []);
assert.deepEqual(occurrencesInWindow({ ...daily, minutes: [] }, midnight, midnight + 12 * hour, "Asia/Taipei"), []);
assert.deepEqual(occurrencesInWindow(daily, midnight, midnight - 1, "Asia/Taipei"), []);
const overlapping = occurrencesInWindow({ ...hourly, durationSeconds: 5400 }, midnight + 120_000, midnight + 2 * hour, "Asia/Taipei");
assert.equal(overlapping.filter((run) => run.active).length, 2, "Retain overlapping runs without losing future starts");
assert.equal(overlapping.at(-1).start, midnight + 2 * hour);

const events = JSON.parse(readFileSync(new URL("../public/data/event-schedule.json", import.meta.url), "utf8"));
const referenceIndex = JSON.parse(readFileSync(new URL("../public/data/reference/index.json", import.meta.url), "utf8"));
const entranceCatalog = JSON.parse(readFileSync(new URL("../public/data/event-entrances.json", import.meta.url), "utf8"));
const summariesById = new Map(referenceIndex.entries.map((entry) => [entry.id, entry]));
assert.ok(events.some((event) => (event.mapTargets ?? []).length > 1), "At least one scheduled activity has multiple entrance choices");
for (const event of events.filter((entry) => entry.kind === "activity")) {
  const positions = new Set();
  for (const target of event.mapTargets ?? []) {
    const map = JSON.parse(readFileSync(new URL(`../public/maps/${target.mapId}/metadata.json`, import.meta.url), "utf8"));
    if (target.markerId.startsWith("region:")) {
      const regionId = target.markerId.slice("region:".length);
      assert.ok(map.regions.some((region) => region.id === regionId), `${event.name}: interior region must exist`);
      assert.ok(map.insets.some((inset) => inset.id === regionId), `${event.name}: interior inset must exist`);
      const position = `${target.mapId}:${regionId}:${target.faction}`;
      assert.ok(!positions.has(position), `${event.name}: duplicate interior region`);
      positions.add(position);
      continue;
    }
    const marker = map.locations.find((location) => location.id === target.markerId);
    assert.equal(marker?.category, "event-entrance", `${event.name}: map target must be an entrance`);
    const entrance = entranceCatalog.npcs[marker.entityId];
    assert.equal(summariesById.get(entrance?.eventId)?.activity?.familyId, event.id, `${event.name}: entrance must lead to this event family`);
    const position = `${target.mapId}:${marker.x}:${marker.y}:${target.faction}`;
    assert.ok(!positions.has(position), `${event.name}: duplicate entrance position`);
    positions.add(position);
  }
}
const scheduledFamilies = new Set();
for (const entry of referenceIndex.entries.filter((entry) => entry.activity?.kind === "event" && entry.activity.listed !== false)) {
  const detail = JSON.parse(readFileSync(new URL(`../public/data/reference/activities/${entry.chunk}.json`, import.meta.url), "utf8")).entries[entry.id];
  if (detail.sections.some((section) => section.title === "reference.labels.schedule")) scheduledFamilies.add(entry.activity.familyId);
}
assert.deepEqual(new Set(events.filter((event) => event.kind !== "world-boss").map((event) => event.id)), scheduledFamilies, "Timers must cover listed activity families only");
const scheduledBosses = referenceIndex.entries.flatMap((summary) => (summary.worldBoss ?? [])
  .filter((record) => record.schedule)
  .map((record) => ({ summary, schedule: record.schedule })));
const bossEvents = events.filter((event) => event.kind === "world-boss");
assert.equal(bossEvents.length, scheduledBosses.length, "Every verified world-boss schedule belongs in Events");
assert.deepEqual(new Set(bossEvents.map((event) => event.id)), new Set(scheduledBosses.map(({ schedule }) => `world-boss:${schedule.id}`)));
assert.ok(events.length > 0);
assert.equal(new Set(events.map((event) => event.id)).size, events.length);
for (const event of events) {
  assert.ok(event.name && event.target?.id);
  assert.ok(event.days.length && event.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  assert.ok(event.minutes.length && event.minutes.every((minute) => Number.isInteger(minute) && minute >= 0 && minute < 1440));
  if (event.kind === "world-boss") {
    const source = referenceIndex.entries.find((entry) => entry.id === event.target.id);
    assert.ok(source?.worldBoss?.some((record) => record.schedule?.id === event.id.replace("world-boss:", "")));
    assert.equal(event.entryWindowSeconds, 0, `${event.name}: boss lifetime is unknown`);
    assert.equal(event.durationSeconds, 0, `${event.name}: boss lifetime is unknown`);
    assert.ok(event.region);
    assert.ok(event.mapTarget, `${event.name}: scheduled boss needs a verified map marker`);
    const map = JSON.parse(readFileSync(new URL(`../public/maps/${event.mapTarget.mapId}/metadata.json`, import.meta.url), "utf8"));
    assert.ok(map.locations.some((location) => location.id === event.mapTarget.markerId), `${event.name}: map target must resolve to a marker`);
    continue;
  }
  assert.notEqual(referenceIndex.entries.find((entry) => entry.id === event.target.id)?.activity?.listed, false, "Timers must not target technical records");
  assert.equal(event.entryWindowSeconds, 180, `${event.name}: admission is three minutes`);
  assert.equal(event.durationSeconds, 1800, `${event.name}: the full slot lasts thirty minutes`);
  assert.equal(event.durationSeconds - event.entryWindowSeconds, 1620, `${event.name}: gameplay lasts twenty-seven minutes`);
  const opening = nextOccurrence(event, start, "Asia/Taipei").nextStart;
  assert.equal(nextOccurrence(event, opening, "Asia/Taipei").active, true);
  assert.equal(nextOccurrence(event, opening + 179_999, "Asia/Taipei").active, true);
  assert.equal(nextOccurrence(event, opening + 179_999, "Asia/Taipei").entryOpen, true);
  assert.equal(nextOccurrence(event, opening + 180_000, "Asia/Taipei").entryOpen, false);
  assert.equal(nextOccurrence(event, opening + 180_000, "Asia/Taipei").active, true);
  assert.equal(nextOccurrence(event, opening + event.durationSeconds * 1000 - 1, "Asia/Taipei").active, true);
  assert.equal(nextOccurrence(event, opening + event.durationSeconds * 1000, "Asia/Taipei").active, false);
  assert.equal(nextOccurrence(event, opening + 30 * 60_000 - 1, "Asia/Taipei").active, true);
  assert.equal(nextOccurrence(event, opening + 30 * 60_000, "Asia/Taipei").active, false);
  assert.equal(nextOccurrence(event, opening + 33 * 60_000, "Asia/Taipei").active, false);
  assert.ok(nextOccurrence(event, start, "Asia/Taipei"));
}
const halfHourEvent = events.find(event => event.minutes.includes(150));
assert.ok(halfHourEvent);
const halfHourStart = Date.parse("2026-09-20T02:30:00Z");
const halfHourEnd = Date.parse("2026-09-20T03:00:00Z");
const halfHourRun = nextOccurrence(halfHourEvent, halfHourStart, "UTC");
assert.equal(halfHourRun.entryEnd, Date.parse("2026-09-20T02:33:00Z"));
assert.equal(halfHourRun.end, halfHourEnd, "02:30 events must end at 03:00, including preparation");
assert.equal(nextOccurrence(halfHourEvent, halfHourEnd, "UTC").active, false);
assert.ok(!occurrencesInWindow(halfHourEvent, halfHourEnd, halfHourEnd + hour, "UTC").some(run => run.start === halfHourStart), "The timeline must remove the finished 02:30 slot at 03:00");

const evening = { ...daily, minutes: [1290], durationSeconds: 0, entryWindowSeconds: 0 };
for (const [zone, summer, winter] of [
  ["Europe/Berlin", "2026-09-21T19:30:00Z", "2026-12-21T20:30:00Z"],
  ["America/New_York", "2026-09-22T01:30:00Z", "2026-12-22T02:30:00Z"],
  ["America/Los_Angeles", "2026-09-22T04:30:00Z", "2026-12-22T05:30:00Z"],
  ["Asia/Seoul", "2026-09-21T12:30:00Z", "2026-12-21T12:30:00Z"],
  ["America/Sao_Paulo", "2026-09-22T00:30:00Z", "2026-12-22T00:30:00Z"],
]) {
  for (const expected of [summer, winter]) {
    const instant = Date.parse(expected);
    assert.equal(nextOccurrence(evening, instant - 1, zone).start, instant, `${zone}: 21:30 uses the target date's offset`);
  }
}
// A local calendar day can differ from UTC.
const mondayEvening = { ...evening, days: [1] };
assert.equal(nextOccurrence(mondayEvening, Date.parse("2026-09-22T01:00:00Z"), "America/New_York").start, Date.parse("2026-09-22T01:30:00Z"));
// A horizon crossing a transition must not reuse today's UTC offset.
assert.equal(nextOccurrence({ ...evening, days: [0] }, Date.parse("2026-10-24T20:00:00Z"), "Europe/Berlin").start, Date.parse("2026-10-25T20:30:00Z"));
assert.equal(nextOccurrence({ ...evening, days: [0] }, Date.parse("2026-03-28T22:00:00Z"), "Europe/Berlin").start, Date.parse("2026-03-29T19:30:00Z"));
const instantHourly = { ...hourly, durationSeconds: 0, entryWindowSeconds: 0 };
for (const [zone, begin, finish, count] of [
  ["Europe/Berlin", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z", 23],
  ["Europe/Berlin", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z", 25],
  ["America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", 23],
  ["America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", 25],
  ["America/Los_Angeles", "2026-03-08T08:00:00Z", "2026-03-09T07:00:00Z", 23],
  ["America/Los_Angeles", "2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z", 25],
]) {
  const runs = occurrencesInWindow(instantHourly, Date.parse(begin) - 1, Date.parse(finish) - 1, zone);
  assert.equal(runs.length, count, `${zone}: spring gaps are skipped and autumn folds retain both instants`);
  assert.equal(new Set(runs.map(({ start }) => start)).size, count);
  assert.equal(new Set(runs.map((run) => reminderKey(run, zone))).size, count);
}
const fold = { ...daily, minutes: [150], entryWindowSeconds: 600, durationSeconds: 1800 };
const foldRuns = occurrencesInWindow(fold, Date.parse("2026-10-25T00:00:00Z"), Date.parse("2026-10-25T02:00:00Z"), "Europe/Berlin");
assert.deepEqual(foldRuns.map(({ start }) => new Date(start).toISOString()), ["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]);
assert.ok(foldRuns.every(run => run.end - run.start === 1800_000), "Durations remain elapsed time across clock changes");
assert.notEqual(reminderKey(foldRuns[0], "Europe/Berlin"), reminderKey(foldRuns[1], "Europe/Berlin"));
assert.throws(() => nextOccurrence(daily, start, "Not/A_Zone"), RangeError);
console.log(`Event schedule tests passed: 12-hour timeline, repeated and overlapping runs, time zones, weekly rollover, midnight, active boundaries, reminder identities and ${events.length} event families.`);
