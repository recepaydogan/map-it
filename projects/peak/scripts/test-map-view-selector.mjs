import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const locale = JSON.parse(await readFile(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../src/features/map/map-view-selector.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) => name === "react-i18next"
    ? { useTranslation: () => ({ t: (key) => key.split(".").reduce((value, part) => value[part], locale) }) }
    : require(name),
});
for (const hasFinalLevel of [false, true]) {
  for (const view of ["daily", "final"]) {
    let selected = null;
    const buttons = exports.default({ view, hasFinalLevel, onChange: (next) => { selected = next; } }).props.children;
    assert.equal(buttons.length, 2, "both map controls remain visible, including with old or missing final data");
    assert.equal(buttons[0].props.children[0], "Today's island");
    assert.equal(buttons[1].props.children[0], "The Final Ascent");
    assert.equal(buttons[0].props.disabled, false);
    assert.equal(buttons[1].props.disabled, !hasFinalLevel);
    assert.equal(buttons[1].props["aria-pressed"], view === "final" && hasFinalLevel);
    buttons[0].props.onClick();
    assert.equal(selected, "daily");
    if (hasFinalLevel) {
      buttons[1].props.onClick();
      assert.equal(selected, "final");
    }
  }
}
const screen = await readFile(new URL("../src/features/map/map-screen.tsx", import.meta.url), "utf8");
assert.doesNotMatch(screen, /peakMap\.hasFinalLevel\s*&&/, "the screen must not hide the whole selector");
assert.doesNotMatch(screen, /mapView === "daily" \? liveState\?\.sceneName/, "switching tabs must preserve the live scene");
assert.match(
  screen,
  /const DAILY_ISLAND_START = \{ x: 50\.2, y: 90\.7 \}/,
  "the in-game map must have a deterministic crashed-plane opening position",
);
assert.match(
  screen,
  /miniMapOpenRevision.*shownLevel\.scene.*miniMapZoom/s,
  "opening the in-game map must reapply its start view for the current island",
);
console.log("Map view selector regressions passed.");
