import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { groupActivities, matchesActivity } from "../src/features/reference/activity-families.ts";

const index = JSON.parse(await readFile(new URL("../public/data/reference/index.json", import.meta.url), "utf8"));
const entries = index.entries.filter((entry) => entry.category === "activities");
const families = groupActivities(entries);
assert.equal(families[0].name, "Gatekeeper Pinopi", "Challenge browsing should follow the source's layer and display order");
const listed = entries.filter((entry) => entry.activity?.listed !== false);
const technical = entries.filter((entry) => entry.activity?.listed === false);
assert.equal(new Set(families.flatMap((family) => family.variants.map((entry) => entry.id))).size, listed.length, "Normal browsing must exclude technical variants");
assert.equal(technical.length, 52, "Unclassified event records must remain outside normal browsing");
for (const entry of technical) {
  const linked = groupActivities(entries, entry.id).flatMap((family) => family.variants);
  assert.ok(linked.some((variant) => variant.id === entry.id), "Every technical deep link must remain accessible");
  assert.equal(linked.filter((variant) => variant.activity?.listed === false).length, 1, "A deep link must not expose other technical variants");
}
assert.equal(listed.filter((entry) => entry.activity?.kind === "event").length, 25);
for (const entry of entries) {
  const detail = JSON.parse(await readFile(new URL(`../public/data/reference/activities/${entry.chunk}.json`, import.meta.url), "utf8")).entries[entry.id];
  assert.deepEqual(detail.activity, entry.activity, "Index and details must agree, including technical records");
}
const jump = families.find((family) => family.id === "event:STR_CONTENTS_TITLE_FE_JUMPJUMP");
assert.deepEqual(jump.variants.map((entry) => entry.id), ["FieldEvent:110101", "FieldEvent:210101"]);
for (const entry of jump.variants) {
  const detail = JSON.parse(await readFile(new URL(`../public/data/reference/activities/${entry.chunk}.json`, import.meta.url), "utf8")).entries[entry.id];
  assert.ok(detail.sections.some((section) => section.title === "reference.labels.possible-rewards" && section.rows?.some((row) => row.links?.length)), "Both faction variants need their own published rewards");
}
assert.ok(families.length < entries.length);
for (const family of families) {
  assert.ok(family.name.length < 100 && !family.name.includes("\n"), "An activity needs a title, not prose");
  assert.ok(matchesActivity(family, family.name.toUpperCase()));
  for (const entry of family.variants) {
    assert.equal(entry.activity.familyId, family.id);
    const detail = JSON.parse(await readFile(new URL(`../public/data/reference/activities/${entry.chunk}.json`, import.meta.url), "utf8")).entries[entry.id];
    assert.equal(detail.name, entry.name);
    assert.deepEqual(detail.activity, entry.activity);
  }
  if (family.kind === "challenge") {
    const levels = family.variants.map((entry) => entry.activity.level);
    assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
    assert.equal(new Set(levels).size, levels.length, "Distinct challenge tracks must not be merged");
  }
}
const sample = (id, familyId, level, region) => ({ id, category: "activities", chunk: "00", name: "Shared name", activity: { kind: "challenge", familyId, level, region } });
const tracks = groupActivities([sample("a", "first", 10, "North"), sample("b", "first", 2, "South"), sample("c", "second", 1, "West")]);
assert.equal(tracks.length, 2, "Matching names do not prove a shared family");
assert.deepEqual(tracks[0].variants.map((entry) => entry.id), ["b", "a"]);
assert.ok(matchesActivity(tracks[0], "shared NORTH"));
assert.ok(!matchesActivity(tracks[0], "missing"));
const eventSample = (id, listed) => ({ ...sample(id, "event-family", undefined, ""), activity: { kind: "event", familyId: "event-family", listed } });
assert.deepEqual(groupActivities([eventSample("configured-without-rewards", true), eventSample("technical", false)])[0].variants.map((entry) => entry.id), ["configured-without-rewards"], "Listing must follow the source classification, not reward availability");
console.log(`Activity tests passed: ${entries.length} records in ${families.length} families.`);
