import path from "node:path";
import { spawn } from "node:child_process";

export const root = path.resolve(import.meta.dirname, "..");
export async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} ${args[0]} failed (${signal || code}).`)));
  });
}
