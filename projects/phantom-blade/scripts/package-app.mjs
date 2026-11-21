import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(root, ".release-dist");
if (path.dirname(output) !== root) throw new Error("Release output must stay inside this project.");
if (!process.argv.includes("--local-only")) {
  execFileSync(process.execPath, ["scripts/publish-release-content.mjs", "--upload"], { cwd: root, stdio: "inherit" });
}
execSync("npm run validate:manifest && npm run build:icons && npx tsc -b && npx vite build --outDir .release-dist --emptyOutDir", {
  cwd: root, stdio: "inherit",
});
execFileSync(process.execPath, ["--experimental-strip-types", "scripts/validate-app-manifest.mjs", ".release-dist/manifest.json"], { cwd: root, stdio: "inherit" });
const { walk, isRemoteContent } = await import("./release-content.mjs");
for (const file of await walk(output)) {
  const relative = path.relative(output, file).split(path.sep).join("/");
  if (isRemoteContent(relative)) throw new Error(`CDN content must not enter the OPK: ${relative}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const zip = path.join(root, `${packageMetadata.name}-${manifest.meta.version}.zip`);
const opk = path.join(root, `${packageMetadata.name}-${manifest.meta.version}.opk`);
for (const file of [zip, opk]) if (fs.existsSync(file)) fs.unlinkSync(file);
execFileSync("tar", ["-a", "-c", "-f", zip, "-C", output, ...fs.readdirSync(output)], { cwd: root, stdio: "inherit" });
fs.renameSync(zip, opk);
const entries = execFileSync("tar", ["-tf", opk], { encoding: "utf8" }).split(/\r?\n/);
if (!entries.includes("manifest.json") || entries.some((entry) => entry.startsWith("./"))) {
  throw new Error("Invalid Overwolf package layout.");
}
console.log(`Created ${opk}`);
