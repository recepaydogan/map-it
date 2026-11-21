import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const languages = { de: "deDE", "pt-BR": "ptBR" };

test("untranslated Gahz'ridian quest titles reuse the client's LockType name", async () => {
  const source = await read("public/data/locales/wow-forever/source.json");
  const index = source.keys.indexOf("LockType:15:1");
  assert.notEqual(index, -1);
  assert.equal(source.values[index], "Gahz'ridian");
  for (const [language, gameLocale] of Object.entries(languages)) {
    const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
    const app = await read(`src/i18n/locales/${language}.json`);
    assert.equal(app.map.questMarkers["1013445"].name, pack.values[index], language);
  }
});
