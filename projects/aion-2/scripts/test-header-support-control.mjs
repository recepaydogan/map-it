import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const en = JSON.parse(await readFile(new URL("../src/i18n/locales/en.json", import.meta.url), "utf8"));
let navigations = 0;
let nudgeSeen = false;
let badges = { unreadReplies: 0, inboxPending: 0, isAdmin: false };
const mocks = {
  react: { useId: () => "support-description" },
  "react-i18next": {
    useTranslation: () => ({ t: (key) => key.split(".").reduce((value, part) => value[part], en) }),
  },
  "lucide-react": { MessageCircleQuestion: "message-circle-question" },
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
runInNewContext(compiled, { exports, require: (name) => mocks[name] ?? require(name) });

const render = (active = false) => exports.default({ active, onNavigate: () => { navigations++; } });
const button = (tree) => tree.props.children.find((child) => child?.type === "button");
const label = (tree) => button(tree).props.children.find((child) => child?.type === "span")?.props.children;

const idle = render();
assert.equal(label(idle), en.support.title);
assert.equal(button(idle).props.title, undefined);
assert.equal(button(idle).props.children[0].type, "message-circle-question");
assert.equal(button(idle).props["aria-describedby"], "support-description");
assert.equal(idle.props.children[1].props.children, en.support.buttonIdle);

badges = { unreadReplies: 1, inboxPending: 0, isAdmin: false };
const waiting = render();
assert.equal(label(waiting), en.support.title);
assert.equal(waiting.props.children[1].props.children, en.support.buttonWaiting);
assert.equal(button(waiting).props.children[2].props["aria-hidden"], "true");

badges = { unreadReplies: 0, inboxPending: 2, isAdmin: true };
assert.equal(render().props.children[1].props.children, en.support.buttonWaiting);
assert.equal(button(render(true)).props["aria-current"], "page");
button(render()).props.onClick();
assert.equal(navigations, 1);
assert.equal(nudgeSeen, true);
console.log("Support control tests passed: stable label, accessible status, badges, and navigation.");
