import assert from "node:assert/strict";
import test from "node:test";
import { layoutLinkedContent } from "./linked-content.ts";

test("inflected official names keep their original clickable actions", () => {
  const links = [{ label: "Flame Altar", page: "Flame Altar" }];
  const translated = [{ ...links[0], label: "Алтарь Пламени" }];
  const result = layoutLinkedContent("Return to the Flame Altar.", links, "Вернитесь к Алтарю Пламени.", translated);
  assert.equal(result.matches.length, 0);
  assert.equal(result.supplemental.length, 1);
  assert.equal(result.supplemental[0].link.page, "Flame Altar");
});

test("matching translated names stay inline without duplicate action links", () => {
  const result = layoutLinkedContent("Speak with the Blacksmith.", [{ label: "Blacksmith" }],
    "Demirci ile konuş.", [{ label: "Demirci" }]);
  assert.equal(result.matches[0].start, 0);
  assert.equal(result.supplemental.length, 0);
});

test("translations do not invent links that were absent from the source sentence", () => {
  const result = layoutLinkedContent("Return home.", [{ label: "Blacksmith" }],
    "Eve dön.", [{ label: "Demirci" }]);
  assert.equal(result.supplemental.length, 0);
});
