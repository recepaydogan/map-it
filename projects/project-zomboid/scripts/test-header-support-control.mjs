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
let navigations = 0;
let nudgeSeen = false;
let badges = { unreadReplies: 0, inboxPending: 0, isAdmin: false };
const mocks = {
  "react-i18next": {
    useTranslation: () => ({ t: (key) => key.split(".").reduce((value, part) => value[part], locales[language]) }),
  },
  "lucide-react": { MessageCircleQuestion: "message-circle-question" },
  "../../state/use-support": { useSupportBadges: () => badges },
  "./header-tab": { default: "header-tab" },
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
});

const render = (active = false) => exports.default({ active, onNavigate: () => { navigations++; } });
const tab = (tree) => tree.props.children.find((child) => child?.type === "header-tab");

for (const code of Object.keys(locales)) {
  language = code;
  assert.equal(tab(render()).props.label, locales[code].support.title);
}

language = "en";
assert.equal(tab(render()).props.title, locales.en.support.buttonIdle);
badges = { unreadReplies: 1, inboxPending: 0, isAdmin: false };
assert.equal(tab(render()).props.title, locales.en.support.buttonWaiting);
assert.equal(tab(render()).props.badge, true);
badges = { unreadReplies: 0, inboxPending: 2, isAdmin: true };
assert.equal(tab(render()).props.badge, true);
assert.equal(tab(render(true)).props.active, true);
tab(render()).props.onClick();
assert.equal(navigations, 1);
assert.equal(nudgeSeen, true);

console.log(`Support control tests passed: visible name, ${Object.keys(locales).length} locales, badges, navigation, and nudge dismissal.`);
