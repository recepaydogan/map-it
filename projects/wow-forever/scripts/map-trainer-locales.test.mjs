import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = (await read("src/i18n/locales/en.json")).map;
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];

test("map trainer roles keep all published NPCs and translate their titles and factions", async () => {
  for (const language of languages) {
    const map = (await read(`src/i18n/locales/${language}.json`)).map;
    for (const group of ["classTrainers", "professionTrainers"]) {
      for (const [id, source] of Object.entries(english[group])) {
        const translated = map[group][id];
        assert.ok(translated, `${language}/${group}/${id}`);
        if (source.title) {
          assert.ok(translated.title && translated.title !== source.title, `${language}/${group}/${id}/title`);
        }
        if (source.role) {
          assert.ok(translated.role && translated.role !== source.role, `${language}/${group}/${id}/role`);
          if (source.role.includes(" · ")) assert.ok(translated.role.includes(" · "));
        }
      }
    }
  }
});
