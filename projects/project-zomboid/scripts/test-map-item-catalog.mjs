import assert from "node:assert/strict";
import { buildMapItemCatalog, parseScriptItemIds } from "./map-item-catalog.mjs";

const sources = [`
module Base
{
  item Hammer
  {
    Tags = base:hammer;base:tool,
  }
}
module Radio
{
  item Receiver
  {
  }
}
`];

assert.deepEqual([...parseScriptItemIds(sources)], ["Base.Hammer", "Radio.Receiver"]);
assert.deepEqual(
  buildMapItemCatalog(sources, { "Base.Hammer": "Hammer" }, new Set(["Base.Hammer", "Base.Unknown"])),
  [
    { id: "Base.Hammer", name: "Hammer", lootable: true, tags: ["base:hammer", "base:tool"] },
    { id: "Base.Unknown", name: "Unknown", lootable: true, tags: [] },
    { id: "Radio.Receiver", name: "Receiver", lootable: false, tags: [] },
  ],
);

console.log("Map item catalog tests passed.");
