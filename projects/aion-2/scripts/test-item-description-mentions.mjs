import assert from "node:assert/strict";
import { findItemDescriptionMentions } from "../src/features/database/item-description-mentions.ts";

const items = new Map([
  ["rare", { id: "rare", name: "Revelation Amulet" }],
  ["epic", { id: "epic", name: "Revelation Amulet" }],
  ["scroll", { id: "scroll", name: "Revelation Amulet Enhance Scroll (Bound)" }],
  ["duplicate", { id: "duplicate", name: "Revelation Amulet", duplicateOf: "rare" }],
]);

const description = "Use the Revelation Amulet Enhance Scroll (Bound) to enhance the Revelation Amulet.";
const mentions = findItemDescriptionMentions(description, items);
assert.deepEqual(mentions.map(({ start, end, items: matches }) => ({
  text: description.slice(start, end), ids: matches.map((item) => item.id),
})), [
  { text: "Revelation Amulet Enhance Scroll (Bound)", ids: ["scroll"] },
  { text: "Revelation Amulet", ids: ["rare", "epic"] },
]);
assert.deepEqual(findItemDescriptionMentions("Revelation Amulets are rare.", items), []);
