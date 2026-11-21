import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(root, "../PZ/.release-dist/native-position/runtime/bin");
const target = path.resolve(root, "public/apps/project-zomboid/native-position/runtime/bin");
if (!target.startsWith(root + path.sep)) throw new Error("Invalid runtime destination");
let copied = 0;
async function copy(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const input = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unexpected runtime link");
    if (entry.isDirectory()) await copy(input);
    else {
      const output = path.join(target, path.relative(source, input));
      await fs.mkdir(path.dirname(output), { recursive: true });
      const bytes = await fs.readFile(input);
      await fs.writeFile(output, bytes);
      if (createHash("sha256").update(await fs.readFile(output)).digest("hex") !== createHash("sha256").update(bytes).digest("hex")) throw new Error("Runtime copy failed");
      copied++;
    }
  }
}
await copy(source);
for (const name of ["java.exe", "attach.dll", "server/jvm.dll"]) await fs.access(path.join(target, name));
console.log(JSON.stringify({ status: "passed", restoredNativeFiles: copied }));
