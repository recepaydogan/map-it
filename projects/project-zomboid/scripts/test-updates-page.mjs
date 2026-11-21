import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { Fragment } from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const localeDirectory = new URL("../src/i18n/locales/", import.meta.url);
const locales = Object.fromEntries(await Promise.all(
  (await readdir(localeDirectory)).filter((file) => file.endsWith(".json")).map(async (file) => [
    file.slice(0, -5), JSON.parse(await readFile(new URL(file, localeDirectory), "utf8")),
  ]),
));
let language = "en";
let requests = 0;
let backNavigations = 0;
// Extra versions are test fixtures only; the app never displays invented releases.
const releases = [{
  version: "1.0.8",
  publishedAt: "2026-08-31",
  translationKey: "updates.releases.v108",
  modNames: ["Vila Z", "Fort Preston"],
}];
const mocks = {
  react: { Fragment, useRef: () => ({ current: null }), useEffect: () => {} },
  "lucide-react": { ArrowLeft: "arrow-left", ArrowRight: "arrow-right", Bell: "bell" },
  "react-i18next": {
    useTranslation: () => ({
      i18n: { resolvedLanguage: language },
      t: (key, values = {}) => key.split(".").reduce((value, part) => value[part], locales[language])
        .replace(/{{(\w+)}}/g, (_, key) => values[key]),
    }),
  },
  "./release-notes": { RELEASE_NOTES: releases },
};
const source = await readFile(new URL("../src/features/updates/updates-page.tsx", import.meta.url), "utf8");
const exports = {};
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { exports, require: (name) => mocks[name] ?? require(name) });

const render = () => exports.default({
  onNavigateMap: () => { backNavigations++; },
  onRequestMods: () => { requests++; },
});
const nodes = (tree) => {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
};
for (const code of Object.keys(locales)) {
  language = code;
  const tree = nodes(render());
  const button = tree.find((node) => node.type === "button" && node.props.children?.[0] === locales[code].updates.requestMods);
  assert.ok(button, `${code}: translated request button must be visible.`);
  assert.equal(button.props.type, "button");
  button.props.onClick();
  tree.find((node) => node.type === "button" && node.props["aria-label"] === locales[code].updates.back).props.onClick();
  assert.equal(tree.filter((node) => node.type === "article").length, 1);
  assert.equal(tree.filter((node) => node.type === "hr").length, 0, "A single release needs no inter-release separator.");
  assert.equal(
    tree.filter((node) => node.type === "button" && node.props.children?.[0] === locales[code].updates.requestMods).length,
    1,
    `${code}: a mod release has its own request button.`,
  );
  assert.equal(
    tree.filter((node) => node.type === "span" && node.props.className?.includes("text-accent")).length,
    2,
    `${code}: both mod names use the primary brand color.`,
  );
}
assert.equal(requests, Object.keys(locales).length);
assert.equal(backNavigations, Object.keys(locales).length);
releases.push(
  { ...releases[0], version: "1.0.7", modNames: [] },
  { ...releases[0], version: "1.0.6" },
);
const multiReleaseTree = nodes(render());
assert.equal(multiReleaseTree.filter((node) => node.type === "article").length, releases.length);
assert.equal(multiReleaseTree.filter((node) => node.type === "hr").length, releases.length - 1);
const titles = multiReleaseTree.filter((node) => node.type === "h2").map((node) => node.props.id);
assert.equal(new Set(titles).size, releases.length);
assert.equal(
  multiReleaseTree.filter((node) => node.type === "button" && node.props.children?.[0] === locales[language].updates.requestMods).length,
  2,
  "Only releases that add mods have request buttons.",
);
assert.equal(multiReleaseTree.filter((node) => node.type === "footer").length, 0, "There is no detached global request action.");
console.log(`Updates page passed: ${Object.keys(locales).length} languages, navigation callbacks, and separators between 1–3 releases.`);
