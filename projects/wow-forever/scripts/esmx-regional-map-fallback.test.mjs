import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const get = (object, key) => key.split(".").reduce((node, part) => node?.[part], object);

test("Mexican Spanish map fallbacks have matching marker context and preserve native variants", async () => {
  const source = await read("src/i18n/locales/en.json");
  const spanish = await read("src/i18n/locales/es.json");
  const mexican = await read("src/i18n/locales/es-MX.json");
  const reviewed = await read("data/app-localization/esmx-regional-map-fallback.json");
  assert.ok(Object.keys(reviewed.fields).length > 2000);
  for (const [key, record] of Object.entries(reviewed.fields)) {
    assert.equal(get(source, key), record.english, key);
    assert.equal(get(spanish, key), record.spanish, key);
    assert.equal(get(mexican, key), record.spanish, key);
  }
  assert.equal(mexican.map.questMarkers[1015306].startsAt, "Lumina Vientocantor");
  assert.notEqual(mexican.map.questMarkers[948771].startsAt,
    spanish.map.questMarkers[948771].startsAt);
});
