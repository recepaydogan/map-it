import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { getItemAcquisitionNotes } from "../src/features/database/item-acquisition-notes.ts";

const method = "Obtained by using conversion on monster artwork.";
assert.deepEqual(getItemAcquisitionNotes(`A scrap of artwork.\n${method}`), [method]);
assert.deepEqual(getItemAcquisitionNotes(`A crafting material. ${method}`), [method]);
assert.deepEqual(getItemAcquisitionNotes(`${method}\r\n${method}`), [method]);
assert.deepEqual(getItemAcquisitionNotes("It can be obtained by extracting crystals."), ["It can be obtained by extracting crystals."]);
assert.deepEqual(getItemAcquisitionNotes("Can be obtained at Up! in the festival."), ["Can be obtained at Up! in the festival."]);
for (const description of [
  undefined,
  "Use to obtain various items.",
  "Can be used in conversion to obtain crafting materials.",
  "Can be enhanced with scrolls acquired through the shop.",
  "A chest containing accessories that can be obtained at the dungeon.",
  "The obtained skin can be found in the Closet.",
]) assert.deepEqual(getItemAcquisitionNotes(description), [], `Not an acquisition instruction: ${description}`);

const catalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const item = catalog.items.find((entry) => entry.id === "632520097");
assert(item?.description, "The reported item must exist");
const notes = getItemAcquisitionNotes(item.description);
assert.deepEqual(notes, [item.description.split("\n")[1]], "Show the reported item's exact acquisition method");

const locale = JSON.parse(await readFile("src/i18n/locales/en.json", "utf8"));
const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: locale } }, interpolation: { escapeValue: false } });
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { default: ItemAcquisitionSection } = await server.ssrLoadModule("/src/features/database/item-acquisition.tsx");
  const render = (props) => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(ItemAcquisitionSection, props)));
  const markup = render({ acquisition: null, notes });
  assert(markup.includes(notes[0]), "Show description instructions without a source-table entry");
  assert(!markup.includes(locale.database.acquisition.none), "Do not deny known acquisition information");
  assert(render({ acquisition: null }).includes(locale.database.acquisition.none), "Keep the empty state for unknown acquisition");
  const sourcedMarkup = render({
    notes,
    acquisition: {
      drops: [{ kind: "enemy-drop", name: "Test enemy", source: "Test.dat" }],
      merchants: [], gathering: [], shops: [], crafting: [], pickups: [], coinShops: [],
    },
  });
  assert(sourcedMarkup.includes(notes[0]) && sourcedMarkup.includes("Test enemy"), "Retain both instructions and structured sources");
} finally {
  await server.close();
}
console.log("Item acquisition description and rendering checks passed.");
