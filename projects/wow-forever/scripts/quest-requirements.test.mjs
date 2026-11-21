import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { addClassicProfessionReferences, buildQuestRequirements } from "./lib/quest-requirements.mjs";

const evidence = JSON.parse(await readFile(new URL("../data/site-research/quest-requirements-2026-10-22/browser-evidence.json", import.meta.url), "utf8"));
const data = buildQuestRequirements(evidence);
const [classicReview, candidates] = await Promise.all([
  readFile(new URL("../data/site-research/quest-requirements-2026-10-22/classic-reference-review.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../data/site-research/quest-requirements-2026-10-22/legacy-candidates.json", import.meta.url), "utf8").then(JSON.parse),
]);
const details = new Map(evidence.details.map((detail) => [detail.url.match(/quest=(\d+)/)[1], detail]));

test("retains every eligible class, including class restrictions outside class categories", () => {
  assert.deepEqual(data.quests["96874"].classes.map((entry) => entry.key), ["warrior", "paladin", "shaman"]);
  assert.deepEqual(data.quests["1712"].classes.map((entry) => entry.key), ["warrior"]);
});

test("stores a profession completion objective without inventing an acceptance threshold", () => {
  assert.equal(data.quests["96045"].profession.key, "alchemy");
  assert.deepEqual(data.quests["96045"].skillObjective, { professionKey: "alchemy", level: 20 });
  assert.equal(data.quests["96045"].minimumSkill, undefined);
  assert.equal(data.quests["6624"].profession.key, "first-aid");
  assert.equal(data.quests["6624"].skillObjective, undefined);
});

test("preserves the faction-specific Skyborne identity in explicit race restrictions", () => {
  assert.deepEqual(data.quests["96055"].races.map((entry) => entry.id), ["3", "7", "95"]);
});

test("does not hide profession introductions behind a profession prerequisite", () => {
  assert.deepEqual(data.quests["96626"].learnProfession, { key: "cooking", name: "Cooking" });
  assert.equal(data.quests["96626"].profession, undefined);
  assert.equal(data.quests["96626"].skillObjective, undefined);
});

test("does not turn legacy hints or profession-related quest titles into verified requirements", () => {
  assert.equal(data.quests["4105"]?.profession, undefined);
  assert.equal(data.quests["90"]?.profession, undefined);
  assert.equal(data.quests["6032"]?.profession, undefined);
});

test("adds all 27 Classic associations as advisory data without publishing unverified ranks", () => {
  const withReferences = addClassicProfessionReferences(buildQuestRequirements(evidence), classicReview, candidates, details);
  assert.equal(Object.values(withReferences.quests).filter((quest) => quest.classicProfessionReference).length, 27);
  assert.deepEqual(withReferences.quests["4105"].classicProfessionReference, { key: "herbalism", name: "Herbalism" });
  assert.deepEqual(withReferences.quests["6032"].classicProfessionReference, { key: "tailoring", name: "Tailoring" });
  assert.equal(withReferences.quests["6032"].profession, undefined);
  assert.equal(withReferences.quests["6032"].minimumSkill, undefined);
  assert.doesNotMatch(JSON.stringify(withReferences), /wowhead|https?:|Classic quest text/i);
});

test("rejects missing or mismatched Classic review records", () => {
  const incomplete = structuredClone(classicReview);
  incomplete.records.pop();
  assert.throws(() => addClassicProfessionReferences(buildQuestRequirements(evidence), incomplete, candidates, details), /does not cover/);
  const mismatch = structuredClone(classicReview);
  mismatch.records[0].profession = "Tailoring";
  assert.throws(() => addClassicProfessionReferences(buildQuestRequirements(evidence), mismatch, candidates, details), /Invalid Classic reference/);
});

test("rejects truncated evidence before it can generate a filtering catalog", () => {
  const truncated = structuredClone(evidence);
  truncated.lists[0].rows.pop();
  assert.throws(() => buildQuestRequirements(truncated), /Incomplete list page/);
});

test("public data contains no upstream names, URLs, comments or scraping errors", () => {
  assert.doesNotMatch(JSON.stringify(data), /wowhead|https?:|CloudFront|CLASSIC ERA/i);
});
