import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const sourceQuests = await read("all-quests.json");
const quests = await read("public/data/quests/quest-details.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];

test("community quest hints use the same localized NPC as their linked marker", async () => {
  assert.equal(sourceQuests.find((quest) => quest.id === 949588)?.startsAt,
    "Valennia Stormfist");
  assert.equal(english.map.questMarkers["949588"].startsAt, "Valennia Stormfist");
  assert.equal(english.map.mapgenieCommunity["949588"].detail,
    "Starts with Valennia Stormfist");
  let checked = 0;
  for (const language of languages) {
    const locale = await read(`src/i18n/locales/${language}.json`);
    assert.equal(locale.map.questMarkers["949588"].startsAt,
      locale.map.questMarkers["949585"].startsAt,
      `${language}/949588 uses the client-backed Valennia name`);
    for (const [id, record] of Object.entries(english.map.mapgenieCommunity)) {
      const marker = english.map.questMarkers[id];
      const translatedMarker = locale.map.questMarkers[id];
      const translatedRecord = locale.map.mapgenieCommunity[id];
      if (!marker || !translatedMarker || !translatedRecord) continue;
      for (const [field, npcField] of [["detail", "startsAt"], ["description", "endsAt"]]) {
        const original = marker[npcField];
        const translated = translatedMarker[npcField];
        const expectedEnglish = `${field === "detail" ? "Starts with" : "Turn in to"} ${original}`;
        if (!original || original.includes("(") || !translated || translated === original ||
          record[field] !== expectedEnglish) continue;
        assert.ok(translatedRecord[field]?.endsWith(translated), `${language}/${id}/${field}`);
        checked += 1;
      }
    }
    assert.equal(locale.map.questMarkers["949286"].name,
      locale.map.mapgenieCommunity["949286"].name, `${language}/949286 title`);
  }
  assert.ok(checked > 1500, `NPC names checked: ${checked}`);
  assert.equal(english.map.questMarkers["949286"].name, quests.quests["92516"].title);
  assert.equal((await read("src/i18n/locales/fr.json"))
    .map.mapgenieCommunity["948775"].detail, "Commence auprès d’Eagan le tanneur");
});
