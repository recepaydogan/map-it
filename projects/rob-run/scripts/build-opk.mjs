import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const { name, version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npm = process.env.npm_execpath;

for (const script of ["validate:manifest", "build"]) {
  execFileSync(process.execPath, [npm, "run", script], { cwd: root, stdio: "inherit" });
}
execFileSync(process.execPath, ["--experimental-strip-types", "scripts/validate-manifest.mjs", "dist/manifest.json"],
  { cwd: root, stdio: "inherit" });

const folder = mkdtempSync(join(tmpdir(), "rob-run-opk-"));
const archive = join(folder, "package.zip");
const destination = join(root, name + "-" + version + ".opk");
try {
  execFileSync("tar.exe", ["-a", "-c", "-f", archive, "-C", "dist", ...readdirSync(join(root, "dist"))], { cwd: root, stdio: "inherit" });
  const files = execFileSync("tar.exe", ["-t", "-f", archive], { encoding: "utf8" })
    .split(/\r?\n/).map((entry) => entry.replace(/^\.\//, ""));
  for (const required of ["manifest.json", "index.html", "background.html", "maps/looty-bay/metadata.json",
    "maps/world/metadata.json", "maps/prison/metadata.json", "maps/lennys-motel/metadata.json",
    "maps/sales-center/metadata.json", "maps/settlement/metadata.json", "maps/settlement-2/metadata.json",
    "maps/looty-bay/satellite-overview.webp", "maps/rob-run-icons/places/bank.webp",
    "data/rob-run/items.json", "data/rob-run/heists.json", "data/rob-run/economy.json"]) {
    if (!files.includes(required)) throw new Error("Missing in OPK: " + required);
  }
  renameSync(archive, destination);
  console.log("Created " + destination);
} finally {
  rmSync(archive, { force: true });
  rmdirSync(folder);
}

