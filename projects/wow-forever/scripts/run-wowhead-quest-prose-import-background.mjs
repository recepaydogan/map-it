/** Keep the resumable quest import independent of the terminal and append UTF-8 logs. */
import { spawn } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const retrySourceUnmatched = process.argv.includes("--retry-source-unmatched=true");
const afterSourceTarget = process.argv.includes("--after-source-target=true");
const logName = afterSourceTarget ? "wowhead-quest-prose-target-retry" :
  (retrySourceUnmatched ? "wowhead-quest-prose-source-retry" :
    "wowhead-quest-prose-import");
const output = openSync(join(root, `data/site-research/${logName}.log`), "a");
const errors = openSync(join(root, `data/site-research/${logName}.err.log`), "a");
const child = spawn(process.execPath,
  [join(root, afterSourceTarget ? "scripts/run-wowhead-quest-prose-target-after-source.mjs" :
    "scripts/run-wowhead-quest-prose-import.mjs"),
  ...process.argv.slice(2).filter((arg) => arg !== "--after-source-target=true")],
  { cwd: root, stdio: ["ignore", output, errors], windowsHide: true });
child.on("error", (error) => {
  writeSync(errors, `${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  closeSync(output);
  closeSync(errors);
  process.exitCode = code ?? 1;
});
