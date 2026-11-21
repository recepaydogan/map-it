import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, root } from "./build-process.mjs";

// Direct CLI use enters the same synchronization and optimization pipeline.
export async function packageApp() {
  const output = path.join(root, ".release-dist");
  const manifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8"));
  const metadata = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const limits = JSON.parse(await fs.readFile(path.join(root, "config/build-size-limits.json"), "utf8"));
  const opk = path.join(root, `${metadata.name}-${manifest.meta.version}.opk`);
  const temporary = path.join(root, `.map-it-${process.pid}.pending.zip`);
  try {
    await run(process.execPath, ["--experimental-strip-types", "scripts/validate-app-manifest.mjs", ".release-dist/manifest.json"]);
    await run("python", ["scripts/package-opk.py", output, temporary]);
    const size = (await fs.stat(temporary)).size;
    if (size > limits.opkBytes) throw new Error(`OPK size ${size} exceeds reviewed limit ${limits.opkBytes}; previous OPK preserved.`);
    await fs.rename(temporary, opk);
    console.log(`Created ${opk} (${(size / 1000000).toFixed(2)} MB)`);
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run(process.execPath, ["scripts/build-map-it.mjs", "--opk", ...process.argv.slice(2)]);
}
