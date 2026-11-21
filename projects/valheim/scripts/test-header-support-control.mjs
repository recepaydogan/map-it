import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const localeDirectory = new URL("../src/i18n/locales/", import.meta.url);
const locales = Object.fromEntries(await Promise.all(
  (await readdir(localeDirectory)).filter((file) => file.endsWith(".json")).map(async (file) => [
    file.slice(0, -5), JSON.parse(await readFile(new URL(file, localeDirectory), "utf8")),
  ]),
));
let language = "en";
let state;
let effect;
let interval;
let navigations = 0;
let nudgeSeen = false;
let badges = { unreadReplies: 0, inboxPending: 0, isAdmin: false };
const mocks = {
  "react": {
    useId: () => "support-description",
    useState: (initial) => [state ??= initial, (update) => { state = update(state); }],
    useEffect: (callback) => { effect = callback; },
  },
  "react-i18next": {
    useTranslation: () => ({ t: (key) => key.split(".").reduce((value, part) => value[part], locales[language]) }),
  },
  "lucide-react": { ArrowRight: "arrow-right", MessageCircleQuestion: "message-circle-question" },
  "../../lib/cn": { cn: (...values) => values.filter(Boolean).join(" ") },
  "../../state/use-support": { useSupportBadges: () => badges },
  "./support-nudge": { default: "support-nudge" },
  "./support-nudge-state": { markSupportNudgeSeen: () => { nudgeSeen = true; } },
};
const source = await readFile(new URL("../src/components/layout/header-support-control.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(compiled, {
  exports,
  require: (name) => mocks[name] ?? require(name),
  window: {
    setInterval: (callback, delay) => { interval = { callback, delay }; return 1; },
    clearInterval: (id) => { assert.equal(id, 1); interval = undefined; },
  },
});

const render = (active = false) => exports.default({ active, onNavigate: () => { navigations++; } });
const button = (tree) => tree.props.children.find((child) => child?.type === "button");
const visiblePrompt = (tree) => {
  const prompts = button(tree).props.children.filter((child) => child?.type === "span" && typeof child.props.children === "string");
  assert.equal(prompts.length, 1, "Only the current prompt should be rendered and affect button width.");
  assert.ok(!prompts[0].props["aria-hidden"]);
  return prompts[0].props.children;
};

assert.equal(visiblePrompt(render()), "Missing a feature?");
const cleanup = effect();
assert.equal(interval.delay, 60_000);
const englishPrompts = Object.values(locales.en.support.prompts);
assert.equal(englishPrompts.length, 12);
for (let index = 1; index <= englishPrompts.length; index++) {
  interval.callback();
  assert.equal(visiblePrompt(render()), englishPrompts[index % englishPrompts.length]);
}
for (const code of Object.keys(locales)) {
  language = code;
  const tree = render();
  assert.equal(visiblePrompt(tree), locales[code].support.prompts.missingFeature);
  for (const prompt of Object.values(locales[code].support.prompts)) {
    assert.equal(visiblePrompt(render()), prompt);
    interval.callback();
  }
  assert.equal(button(tree).props.children.at(-1).type, "arrow-right");
  assert.equal(button(tree).props.children.at(-1).props["aria-hidden"], "true");
}
language = "en";
badges = { unreadReplies: 1, inboxPending: 0, isAdmin: false };
assert.equal(button(render()).props.title, locales.en.support.buttonWaiting);
badges = { unreadReplies: 0, inboxPending: 2, isAdmin: true };
assert.equal(button(render()).props.title, locales.en.support.buttonWaiting);
assert.equal(button(render(true)).props["aria-current"], "page");
button(render()).props.onClick();
assert.equal(navigations, 1);
assert.equal(nudgeSeen, true);
cleanup();
assert.equal(interval, undefined);
console.log(`Support control tests passed: current-prompt-only sizing, 60-second rotation, wraparound, ${Object.keys(locales).length} locales, arrow, badges, navigation, and cleanup.`);
