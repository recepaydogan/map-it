import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const [mode, output] = process.argv.slice(2);
if (!["record", "verify"].includes(mode) || !output) throw new Error("Usage: peak-source-snapshot.mjs record|verify <snapshot>");
const root = "C:/Program Files (x86)/Steam/steamapps/common/PEAK";
const files = ["version.txt", "PEAK_Data/Managed/Assembly-CSharp.dll", ...(await readdir(join(root, "PEAK_Data"), { withFileTypes: true }))
  .filter(entry => entry.isFile()).map(entry => entry.name)
  .filter(name => name === "data.unity3d" || /^(level\d+|sharedassets\d+|resources|globalgamemanagers)(\.assets)?(\.resS|\.resource)?$/i.test(name))
  .sort().map(name => `PEAK_Data/${name}`)];
const result = {};
for (const directory of ['PEAK_Data/StreamingAssets/maps', 'PEAK_Data/Managed', 'PEAK_Data/Resources']) {
  for (const entry of (await readdir(join(root, directory), { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${directory}/${entry.name}`;
    if (entry.isFile() && !files.includes(file)) files.push(file);
  }
}
files.push('UnityPlayer.dll', 'PEAK.exe');
for (const file of files) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(join(root, file))) hash.update(data);
  result[file] = hash.digest("hex");
}
const value = JSON.stringify(result);
if (mode === "record") await writeFile(output, value);
else if (await readFile(output, "utf8") !== value) throw new Error("Game source files changed during preparation; publication blocked");
console.log(`Source snapshot ${mode}: ${files.length} files`);
