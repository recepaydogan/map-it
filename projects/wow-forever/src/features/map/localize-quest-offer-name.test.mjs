import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { localizeQuestOfferName } from "./localize-quest-offer-name.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

test("qualified quest offers preserve their verified catalog title and localize both parts", async () => {
  const catalog = (await read("public/data/quests/quest-details.json")).quests;
  const files = ["locations-forever-all-quest-givers.json",
    "locations-forever-new-quest-givers.json"];
  let qualified = 0;
  for (const file of files) {
    const map = await read(`public/maps/world-atlas/${file}`);
    for (const point of map.locations) {
      for (const offer of point.questOffers ?? []) {
        if (offer.name === catalog[offer.id]?.title) continue;
        if (!catalog[offer.id]) continue;
        assert.match(offer.name, / \([^()]+\)$/);
        assert.ok(offer.name.startsWith(`${catalog[offer.id].title} (`), offer.id);
        qualified++;
      }
    }
  }
  assert.ok(qualified > 300);
  const lookup = (english) => ({ "The Spider God": "Le dieu araignée",
    "Zul'Farrak": "Zul'Farrak" })[english] ?? english;
  assert.equal(localizeQuestOfferName("The Spider God (Zul'Farrak)", "2936", lookup),
    "Le dieu araignée (Zul'Farrak)");
  assert.equal(localizeQuestOfferName("Elanaria", "1684", lookup), "Elanaria");
});
