import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { root, walk, digest } from "./prepare-app-content.mjs";
import { loadContentBuild } from "./app-content-build.mjs";
import { workerNeedsContentAdapter } from "./module-asset-build.mjs";
const output = path.resolve(root, process.argv[2] || "dist");
if (!output.startsWith(root + path.sep)) throw new Error("Verification output must be inside Map It");
const content = await loadContentBuild(); assert(content, "Content optimization must be prepared and published");
let omitted = 0, fonts = 0, workers = 0;
const files = await walk(output); const emitted = new Set(files.map(file => path.relative(output, file).split(path.sep).join("/")));
for (const file of content.omitted) {
  assert(!emitted.has(file), `Offloaded/duplicate data is still bundled: ${file}`); omitted++;
}
for (const relative of emitted) assert(!/(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:projects|node_modules)\//.test(relative), `Private input was bundled: ${relative}`);
for (const [app, record] of Object.entries(content.plan.apps)) {
  assert(emitted.has(`apps/${app}/content-config.js`));
  for (const redirect of Object.values(record.redirects)) assert(emitted.has(redirect.slice(1)), `Missing shared/local resource: ${redirect}`);
  for (const [relative, target] of Object.entries(record.stubs)) {
    const text = await fs.readFile(path.join(output, "apps", app, relative), "utf8");
    assert(text.includes("__MAP_IT_CONTENT__.loadJson(")); assert(record.files[target]);
  }
}
for (const file of files) {
  const relative = path.relative(output, file).split(path.sep).join("/");
  if (/worker[^/]*\.js$/.test(relative) && relative.startsWith("apps/")) {
    const text = await fs.readFile(file, "utf8");
    if (workerNeedsContentAdapter(relative, text)) {
      assert(text.includes("__MAP_IT_CONTENT_CONFIG__"), `Worker lacks scoped content routing: ${relative}`);
      workers++;
    }
  }
  if (!file.endsWith(".css")) continue;
  const text = await fs.readFile(file, "utf8");
  for (const match of text.matchAll(/url\((['"]?)([^)'"\s]+)\1\)/g)) {
    if (/^(?:data:|https?:|#)/.test(match[2])) continue;
    const name = decodeURIComponent(new URL(match[2], "https://local.invalid/" + relative).pathname.slice(1));
    assert(emitted.has(name), `Broken CSS asset in ${relative}: ${name}`);
    if (name.endsWith(".woff2")) fonts++;
  }
}
for (const file of ["bin/java.exe", "bin/attach.dll", "bin/server/jvm.dll", "lib/modules"]) {
  const relative = "apps/project-zomboid/native-position/runtime/" + file;
  assert(emitted.has(relative), `Missing native Java runtime: ${file}`);
  assert.equal(digest(await fs.readFile(path.join(output, relative))), content.plan.inputs[relative].sha256);
}
console.log(JSON.stringify({ status: "passed", output, omittedFiles: omitted, validFontReferences: fonts, routedWorkers: workers, remoteObjects: Object.values(content.plan.apps).reduce((sum, app) => sum + Object.keys(app.files).length, 0) }));
