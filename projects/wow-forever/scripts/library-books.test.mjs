import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bookLocationGroup, completeBookLocationIds } from "../src/features/map/library-book-found.ts";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const catalog = readJson("public/data/books/forever-library-books.json");
const pins = readJson("public/maps/world-atlas/locations-books.json").locations;
const search = readJson("public/data/map-search/index.json").locations;

test("catalog keeps book identity separate from pickup locations", () => {
  assert.equal(catalog.version, 2);
  assert.equal(catalog.books.length, 26);
  const keys = catalog.books.flatMap((book) => book.locations.map((location) => `${book.id}:${location.id}`));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(catalog.books.filter((book) => book.locations.some((location) => location.mapStatus === "published")).length, 25);
});

test("published pins and search entries retain canonical book identities", () => {
  const published = catalog.books.flatMap((book) => book.locations
    .filter((location) => location.mapStatus === "published")
    .map((location) => ({ bookId: book.id, locationId: location.id })));
  assert.equal(pins.length, published.length);
  assert.equal(pins.length, 26);
  for (const { bookId, locationId } of published) {
    const pin = pins.find((point) => point.bookId === bookId && point.bookLocationId === locationId);
    assert.ok(pin, `${bookId}:${locationId} has a map pin`);
    assert.ok(search.some((entry) => entry.point.id === pin.id), `${pin.id} is searchable`);
  }
  assert.equal(pins.filter((pin) => pin.bookId === "rumi-of-gnomeregan").length, 2);
  assert.ok(!pins.some((pin) => pin.bookId === "secrets-of-the-dreamers"));
});

test("Found on either Rumi pin covers both locations", () => {
  const [westfall, lochModan] = pins.filter((pin) => pin.bookId === "rumi-of-gnomeregan");
  assert.deepEqual(new Set(bookLocationGroup(pins, westfall.id)), new Set([westfall.id, lochModan.id]));
  assert.deepEqual(new Set(completeBookLocationIds(pins, [lochModan.id])), new Set([westfall.id, lochModan.id]));
  assert.deepEqual(new Set(completeBookLocationIds(pins, [westfall.id])), new Set([westfall.id, lochModan.id]));
});
