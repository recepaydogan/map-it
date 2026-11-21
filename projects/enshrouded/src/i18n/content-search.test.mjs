import assert from "node:assert/strict";
import test from "node:test";
import { matchesContentSearch } from "./content-search.ts";

test("catalog search accepts both official translated names and English aliases", () => {
  const translate = value => ({ "Flame Shrine": "Alev Mabedi", "Light": "Işık" })[value] ?? value;
  assert.equal(matchesContentSearch("alev", ["Flame Shrine"], translate), true);
  assert.equal(matchesContentSearch("flame", ["Flame Shrine"], translate), true);
  assert.equal(matchesContentSearch("ışık", ["Light"], translate), true);
  assert.equal(matchesContentSearch("ISIK", ["Light"], translate), true);
  assert.equal(matchesContentSearch("maden", ["Flame Shrine"], translate), false);
});
