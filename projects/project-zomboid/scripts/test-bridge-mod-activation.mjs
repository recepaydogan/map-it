import assert from "node:assert/strict";
import {
  BRIDGE_MOD_ID,
  createModList,
  isModEnabled,
  withModEnabled,
} from "../src/features/live-bridge/bridge-mod-activation.ts";

const list = (...mods) => [
  "VERSION = 1,",
  "",
  "mods",
  "{",
  ...mods.map((mod) => `    mod = ${mod},`),
  "}",
  "",
  "maps",
  "{",
  "}",
  "",
].join("\r\n");

// A missing or empty list becomes a valid one holding just the Bridge.
assert.equal(withModEnabled(null, BRIDGE_MOD_ID), createModList(BRIDGE_MOD_ID));
assert.equal(withModEnabled("   \r\n", BRIDGE_MOD_ID), createModList(BRIDGE_MOD_ID));
assert.equal(isModEnabled(createModList(BRIDGE_MOD_ID), BRIDGE_MOD_ID), true);

// Existing mods are kept, in order, with the Bridge appended.
assert.equal(
  withModEnabled(list("RavenCreekB42", "42Grapeseed"), BRIDGE_MOD_ID),
  list("RavenCreekB42", "42Grapeseed", BRIDGE_MOD_ID),
);

// An empty mods block still gets the entry.
assert.equal(withModEnabled(list(), BRIDGE_MOD_ID), list(BRIDGE_MOD_ID));

// Already enabled — nothing to write, in either line-ending style.
assert.equal(withModEnabled(list(BRIDGE_MOD_ID), BRIDGE_MOD_ID), null);
assert.equal(withModEnabled(list("A", BRIDGE_MOD_ID, "B"), BRIDGE_MOD_ID), null);
assert.equal(
  withModEnabled(list(BRIDGE_MOD_ID).replaceAll("\r\n", "\n"), BRIDGE_MOD_ID),
  null,
);

// LF files stay LF.
const lf = list("RavenCreekB42").replaceAll("\r\n", "\n");
assert.equal(
  withModEnabled(lf, BRIDGE_MOD_ID),
  list("RavenCreekB42", BRIDGE_MOD_ID).replaceAll("\r\n", "\n"),
);

// The `maps` block is left untouched, even when it holds entries.
const withMaps = list("RavenCreekB42").replace("maps\r\n{\r\n}", "maps\r\n{\r\n    Muldraugh, KY,\r\n}");
assert.equal(
  withModEnabled(withMaps, BRIDGE_MOD_ID),
  withMaps.replace(
    `    mod = RavenCreekB42,`,
    `    mod = RavenCreekB42,\r\n    mod = ${BRIDGE_MOD_ID},`,
  ),
);
assert.equal(isModEnabled(withMaps, "Muldraugh, KY"), false);

// A missing final comma and loose indentation are normalised, not duplicated.
const sloppy = "VERSION = 1,\r\n\r\nmods\r\n{\r\n  mod = RavenCreekB42\r\n}\r\n\r\nmaps\r\n{\r\n}\r\n";
assert.equal(withModEnabled(sloppy, BRIDGE_MOD_ID), list("RavenCreekB42", BRIDGE_MOD_ID));

// An unrecognised shape is left alone rather than rewritten from scratch.
assert.equal(withModEnabled("something else entirely\r\n", BRIDGE_MOD_ID), null);

// Only the exact id counts as enabled.
assert.equal(isModEnabled(list(`${BRIDGE_MOD_ID}Extra`), BRIDGE_MOD_ID), false);
assert.equal(isModEnabled(list("RavenCreekB42"), BRIDGE_MOD_ID), false);

console.log("Bridge mod activation tests passed.");
