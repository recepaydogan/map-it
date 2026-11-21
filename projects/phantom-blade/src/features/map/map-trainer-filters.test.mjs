import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import i18next from "i18next";
import { getTrainerFilterKey, resolveHiddenTrainerTypes, TRAINER_CATEGORIES, TRAINER_FILTER_IDS, trainerFilterKey } from "./map-trainer-filters.ts";
import { filterPointsForFactions, getCharacterMapFactions } from "./map-faction-filter.ts";

const character = { classId: "warrior", professions: [{ id: "alchemy" }, { id: "blacksmithing" }] };
const keys = TRAINER_CATEGORIES.flatMap((category) => TRAINER_FILTER_IDS[category].map((id) => trainerFilterKey(category, id)));
const enabled = (stored, profile) => keys.filter((key) => !resolveHiddenTrainerTypes(stored, profile).includes(key));

test("only the character class and chosen professions start enabled", () => {
  assert.deepEqual(enabled(null, character), ["class-trainer:warrior", "profession-trainer:alchemy", "profession-trainer:blacksmithing"]);
  assert.deepEqual(enabled(null, { classId: "mage", professions: [] }), ["class-trainer:mage"]);
  assert.ok(enabled(null, { ...character, professions: [{ id: "firstaid" }, { id: "cooking" }, { id: "fishing" }] })
    .includes("profession-trainer:first-aid"));
});

test("manual additions and removals survive reload and profile edits", () => {
  const hidden = resolveHiddenTrainerTypes(null, character)
    .filter((key) => key !== "class-trainer:mage" && key !== "profession-trainer:engineering");
  hidden.push("profession-trainer:alchemy");
  const stored = JSON.stringify(hidden);
  assert.deepEqual(enabled(stored, character), ["class-trainer:mage", "class-trainer:warrior", "profession-trainer:blacksmithing", "profession-trainer:engineering"]);
  assert.deepEqual(enabled(stored, { classId: "rogue", professions: [] }), enabled(stored, character));
  assert.deepEqual(resolveHiddenTrainerTypes("[]", character), []);
});

test("default profile preserves global choices and invalid storage restores safe defaults", () => {
  assert.deepEqual(resolveHiddenTrainerTypes(null, null), []);
  assert.deepEqual(resolveHiddenTrainerTypes('["class-trainer:mage","invalid"]', null), ["class-trainer:mage"]);
  for (const stored of ["broken", "{}", "null"]) {
    assert.deepEqual(resolveHiddenTrainerTypes(stored, character), resolveHiddenTrainerTypes(null, character));
  }
});

test("actual trainer markers obey class, profession and faction together, with manual opt-in", () => {
  const root = new URL("../../../", import.meta.url);
  const translations = JSON.parse(readFileSync(new URL("src/i18n/locales/en.json", root), "utf8"));
  const i18n = i18next.createInstance();
  i18n.init({ lng: "en", resources: { en: { translation: translations } }, initImmediate: false });
  const registry = readFileSync(new URL("src/features/map/map-registry.ts", root), "utf8");
  const files = [...registry.match(/locationFiles: \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const points = files.flatMap((file) => JSON.parse(readFileSync(new URL(`public/maps/world-atlas/${file}`, root), "utf8")).locations)
    .map((point) => ({ ...point,
      trainerClass: point.trainerClassKey ? i18n.t(point.trainerClassKey) : point.trainerClass,
      trainerTitle: point.trainerTitleKey ? i18n.t(point.trainerTitleKey) : point.trainerTitle,
      label: point.labelKey ? i18n.t(point.labelKey) : point.label,
    }))
    .filter((point) => getTrainerFilterKey(point));
  for (const side of ["horde", "alliance"]) {
    const allowed = getCharacterMapFactions(side);
    const eligible = filterPointsForFactions(points, allowed);
    const hidden = resolveHiddenTrainerTypes(null, character);
    const visible = eligible.filter((point) => !hidden.includes(getTrainerFilterKey(point)));
    assert.deepEqual([...new Set(visible.map(getTrainerFilterKey))].sort(), enabled(null, character).sort());
    assert.ok(visible.every((point) => allowed.includes(point.trainerFaction)));
    const optedIn = hidden.filter((key) => key !== "class-trainer:mage" && key !== "profession-trainer:engineering");
    const extra = eligible.filter((point) => !optedIn.includes(getTrainerFilterKey(point)));
    assert.ok(extra.some((point) => getTrainerFilterKey(point) === "class-trainer:mage"));
    assert.ok(extra.some((point) => getTrainerFilterKey(point) === "profession-trainer:engineering"));
    assert.ok(extra.every((point) => allowed.includes(point.trainerFaction)));
  }
});
