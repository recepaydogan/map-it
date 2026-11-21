import fs from "node:fs/promises";
import path from "node:path";
import { root, cacheRoot, digest, walk } from "./prepare-app-content.mjs";
import { rewriteModuleAccounts } from "./module-account-build.mjs";
import { rewriteModuleAssetPaths, workerNeedsContentAdapter } from "./module-asset-build.mjs";
import { parallel } from "./release-content.mjs";

export async function loadContentBuild() {
  const enabled = await fs.readFile(path.join(cacheRoot, "enabled.json"), "utf8").then(JSON.parse).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (!enabled) {
    const pinned = await fs.stat(path.join(root, "config/app-content-release.json")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (pinned) throw new Error("Lean build inputs are missing. Run prepare:app-content and publish:app-content before building.");
    return null;
  }
  const bytes = await fs.readFile(path.join(cacheRoot, "plan.json"));
  const plan = JSON.parse(bytes);
  const release = JSON.parse(await fs.readFile(path.join(root, "config/app-content-release.json"), "utf8"));
  if (enabled.planSha256 !== digest(bytes) || release.planSha256 !== digest(bytes)) throw new Error("Content preparation/publication changed. Publish the current plan before building.");
  for (const [app, record] of Object.entries(plan.apps)) {
    if (Object.keys(record.files).length && (release.receipts[app]?.fingerprint !== record.fingerprint || release.receipts[app]?.objectsVerified !== Object.keys(record.files).length)) throw new Error(`Unverified CDN release: ${app}`);
  }
  const remaining = new Set(Object.keys(plan.inputs));
  await parallel(await walk(path.join(root, "public/apps")), 16, async file => {
    const relative = path.relative(path.join(root, "public"), file).split(path.sep).join("/");
    const entry = plan.inputs[relative]; const stat = await fs.stat(file);
    if (!entry || entry.size !== stat.size || digest(await fs.readFile(file)) !== entry.sha256) throw new Error(`Imported content changed after publication: ${relative}`);
    remaining.delete(relative);
  });
  if (remaining.size) throw new Error("Imported content was deleted after publication.");
  for (const entry of Object.values({ ...plan.shared, ...plan.prepared, ...release.generated })) if (digest(await fs.readFile(entry.file)) !== entry.sha256) throw new Error("Prepared content changed after verification.");
  const omitted = new Set(plan.omitted);
  const configs = Object.fromEntries(await Promise.all(Object.entries(release.generated).map(async ([name, entry]) => [name.split("/")[1], await fs.readFile(entry.file, "utf8")])));
  const runtime = await fs.readFile(plan.prepared["map-it-content.js"].file, "utf8");
  function rewrite(relative, body) {
    const app = relative.startsWith("apps/") ? relative.split("/")[1] : null;
    const record = plan.apps[app];
    if (!record || !/\.(?:html|css|js|svg|json)$/.test(relative)) return body;
    let text = rewriteModuleAssetPaths(relative, rewriteModuleAccounts(relative, body)).toString("utf8");
    if (relative.endsWith(".html")) text = text.replace('<script src="/map-it-runtime.js"></script>', `<script src="/apps/${app}/content-config.js"></script><script src="/map-it-content.js"></script><script src="/map-it-runtime.js"></script>`);
    const mappings = new Map(Object.entries(record.redirects).map(([from, to]) => [`/apps/${app}/${from}`, to]));
    const urlFor = file => record.redirects[file] || (record.files[file] ? release.receipts[app].baseUrl + "/" + file.split("/").map(encodeURIComponent).join("/") + (release.receipts[app].urlSuffix || "") : null);
    if (relative.endsWith(".css")) {
      text = text.replace(/,\s*url\([^)]*\.woff(?:[?][^)]*)?\)\s*format\(["']?woff["']?\)/g, "");
      text = text.replace(/url\((['"]?)([^)'"\s]+)\1\)/g, (original, quote, value) => {
        const url = new URL(value, "https://local.invalid/" + relative);
        const prefix = `/apps/${app}/`;
        return url.origin === "https://local.invalid" && url.pathname.startsWith(prefix) && urlFor(url.pathname.slice(prefix.length)) ? `url(${JSON.stringify(urlFor(url.pathname.slice(prefix.length)))})` : original;
      });
    }
    if (relative.endsWith(".js")) text = text.replace(/\b(backgroundImage|maskImage|borderImageSource):(`[^`]*`)/g, (_match, property, template) => `${property}:window.__MAP_IT_REWRITE_STYLE__(${template})`);
    // Only complete quoted paths are rewritten. Dynamic data requests pass
    // through the runtime, which verifies and persists the decoded response.
    text = text.replace(/(["'`])(\/apps\/[^"'`\s]+)\1/g, (original, quote, value) => {
      const prefix = `/apps/${app}/`;
      const mapped = mappings.get(value) || (value.startsWith(prefix) ? urlFor(value.slice(prefix.length)) : null);
      return mapped ? quote + mapped + quote : original;
    });
    if (relative.endsWith(".js") && /worker[^/]*\.js$/.test(relative) && workerNeedsContentAdapter(relative, text)) {
      const roots = [...new Set(Object.keys(plan.inputs).filter(name => name.startsWith(`apps/${app}/`)).map(name => name.split("/")[2]))];
      text = configs[app] + runtime + `\n;(()=>{const roots=${JSON.stringify(roots)};const runtime=globalThis.__MAP_IT_CONTENT__;globalThis.fetch=(input,init)=>{const value=input instanceof Request?input.url:String(input);const url=new URL(value,location.href);if(url.origin===location.origin&&!url.pathname.startsWith('/apps/')&&roots.includes(url.pathname.split('/')[1]))url.pathname='/apps/${app}'+url.pathname;return runtime.fetchContent(input instanceof Request?new Request(url,input):url,init);};})();\n` + text;
    }
    return Buffer.from(text);
  }
  return { plan, release, omitted, rewrite, extra: { ...plan.shared, ...plan.prepared, ...release.generated } };
}

export async function shareHostFonts(output, content) {
  if (!content) return;
  const assets = path.join(output, "assets");
  const files = await walk(assets); const redirects = new Map();
  for (const file of files.filter(file => file.endsWith(".woff2"))) {
    const bytes = await fs.readFile(file); const target = `shared/fonts/${digest(bytes)}.woff2`;
    await fs.mkdir(path.join(output, "shared/fonts"), { recursive: true });
    await fs.writeFile(path.join(output, target), bytes);
    redirects.set(path.basename(file), "/" + target);
    await fs.unlink(file);
  }
  for (const file of files.filter(file => /\.(?:js|css)$/.test(file))) {
    let text = await fs.readFile(file, "utf8");
    text = text.replace(/,\s*url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g, "");
    for (const [name, target] of redirects) text = text.replaceAll("/assets/" + name, target);
    await fs.writeFile(file, text);
  }
  for (const file of files.filter(file => file.endsWith(".woff"))) await fs.unlink(file);
}
