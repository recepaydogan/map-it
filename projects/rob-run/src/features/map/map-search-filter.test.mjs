import assert from "node:assert/strict";
import test from "node:test";
import { getMapFilterQuery } from "./map-search-filter.ts";

test("map filtering starts at three trimmed characters", () => {
  for (const query of ["", " ", "a", "ab", " ab "]) {
    assert.equal(getMapFilterQuery(query, query), "");
  }
  assert.equal(getMapFilterQuery("her", "her"), "her");
  assert.equal(getMapFilterQuery(" herb ", " herb "), " herb ");
});

test("short input immediately clears stale worker filters and short results never filter pins", () => {
  assert.equal(getMapFilterQuery("he", "herb"), "");
  assert.equal(getMapFilterQuery("herb", "he"), "");
  assert.equal(getMapFilterQuery("herb", ""), "");
  assert.equal(getMapFilterQuery("herb", "her"), "her");
});
