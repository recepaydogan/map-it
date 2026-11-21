import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const en = JSON.parse(await readFile(new URL("../../i18n/locales/en.json", import.meta.url), "utf8"));
const mocks = {
  "lucide-react": `export const LocateFixed=()=>null;export const X=()=>null;`,
  "react/jsx-runtime": `export const jsx=(type,props)=>({type,props});export const jsxs=jsx;`,
  react: `export const useState=initial=>{const h=globalThis.__noticeTest;
    if(h.state===undefined)h.state=typeof initial==='function'?initial():initial;
    return [h.state,value=>{h.state=value}];};`,
  "react-i18next": `export const useTranslation=()=>({t:key=>key.split('.').reduce((value,part)=>value[part],globalThis.__noticeTest.en)});`,
  "./tracking-status": `export const useTrackingStatus=()=>globalThis.__noticeTest.status;`,
  "./live-position-store": `export const useLivePosition=()=>({status:globalThis.__noticeTest.positionStatus});`,
};
const bundle = await build({ entryPoints: [fileURLToPath(new URL("./tracking-notice.tsx", import.meta.url))],
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic",
  plugins: [{ name: "tracking-notice-mocks", setup(p) {
    p.onResolve({ filter: /.*/ }, args => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
    p.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path] }));
  } }],
});
const { default: TrackingNotice } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`)
  .catch(error => { throw new Error(error.message); });
function harness(t) {
  const h = globalThis.__noticeTest = { en, status: "connecting", positionStatus: "disconnected" };
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  t.after(() => { delete globalThis.__noticeTest; delete globalThis.localStorage; });
  return h;
}

test("the minimap explains Overwolf's outage for every unavailable state without waiting copy", t => {
  const h = harness(t);
  for (const status of ["disabled", "connecting", "waiting-game", "error", "unavailable-map"]) {
    h.status = status;
    const notice = TrackingNotice({ compact: true });
    const body = notice.props.children[1].props.children[1].props.children;
    assert.equal(body, en.announcements.liveTracking.minimapBody);
    assert.match(body, /Overwolf/);
    assert.doesNotMatch(body, /waiting|connecting/i);
  }
  h.positionStatus = "live";
  assert.equal(TrackingNotice({ compact: true }), null);
});

test("closing the minimap explanation stays dismissed when the overlay is recreated", t => {
  const h = harness(t);
  const notice = TrackingNotice({ compact: true });
  notice.props.children[2].props.onClick();
  assert.equal(TrackingNotice({ compact: true }), null);
  h.state = undefined;
  assert.equal(TrackingNotice({ compact: true }), null);
});

test("all nine UI languages contain the new minimap explanation", async () => {
  for (const language of ["en", "de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const locale = JSON.parse(await readFile(new URL(`../../i18n/locales/${language}.json`, import.meta.url), "utf8"));
    assert.ok(locale.announcements.liveTracking.minimapBody?.includes("Overwolf"), language);
  }
});
