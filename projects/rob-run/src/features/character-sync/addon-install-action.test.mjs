import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const en = JSON.parse(await readFile(new URL("../../i18n/locales/en.json", import.meta.url), "utf8"));
const mocks = {
  "lucide-react": "export const Download=()=>null; export const LoaderCircle=()=>null;",
  "react-i18next": `export const useTranslation=()=>({t:key=>key.split('.').reduce((value,part)=>value[part],globalThis.__installUI.en)});`,
  "./addon-sync-store": `export const useAddonSync=()=>globalThis.__installUI.addon;
    export const requestAddonInstall=()=>{globalThis.__installUI.requests++};
    export const updateAddonSync=patch=>Object.assign(globalThis.__installUI.addon,patch);`,
};
const bundle = await build({ entryPoints: [fileURLToPath(new URL("./addon-install-action.tsx", import.meta.url))],
  bundle: true, format: "esm", platform: "node", write: false, jsx: "automatic",
  plugins: [{ name: "install-ui-mocks", setup(p) {
    p.onResolve({filter: /.*/}, args => args.path in mocks ? {path: args.path, namespace: "mock"} : undefined);
    p.onLoad({filter: /.*/, namespace: "mock"}, args => ({contents: mocks[args.path], loader: "js"}));
  }}] });
const { AddonInstallAction } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
function harness(t, status, browser = false) {
  const h = globalThis.__installUI = {en, addon: {status, addonVersion: null}, requests: 0};
  if (!browser) globalThis.overwolf = {};
  h.render = props => {
    const element = AddonInstallAction(props ?? {});
    if (!element) return null;
    const children = element.props.children;
    return {button: children[1].props, message: children[2].props.children};
  };
  t.after(() => {delete globalThis.__installUI; delete globalThis.overwolf});
  return h;
}
test("rendering an install offer does not download; only its click requests installation", t => {
  const h = harness(t, "waiting"); const ui = h.render();
  assert.equal(h.requests, 0); assert.equal(ui.button.disabled, false);
  assert.equal(ui.button.children[1], "Install addon");
  ui.button.onClick(); assert.equal(h.requests, 1);
});
test("a failed download displays its error and exposes a user-driven retry", t => {
  const h = harness(t, "error"); const ui = h.render();
  assert.equal(ui.button.children[1], "Try again"); assert.equal(ui.button.disabled, false);
  assert.match(ui.message, /could not be downloaded or installed/);
  assert.equal(h.requests, 0); ui.button.onClick(); assert.equal(h.requests, 1);
});
test("installation progress disables the action and explains the current work", t => {
  const h = harness(t, "installing"); const ui = h.render();
  assert.equal(ui.button.disabled, true); assert.equal(ui.button.children[1], "Installing…");
  assert.equal(ui.message, en.addonSync.installing); assert.equal(h.requests, 0);
});
test("a browser preview cannot request an Overwolf installation", t => {
  const h = harness(t, "waiting", true); const ui = h.render();
  assert.equal(ui.button.disabled, true); assert.equal(ui.message, en.characterSync.browserHint);
});
test("an installed addon hides redundant offers but keeps manual repair available in connection settings", t => {
  const h = harness(t, "ready"); h.addon.addonVersion = "0.1.5";
  assert.equal(h.render(), null); const ui = h.render({showInstalled: true});
  assert.equal(ui.button.children[1], "Reinstall addon"); assert.equal(h.requests, 0);
});
