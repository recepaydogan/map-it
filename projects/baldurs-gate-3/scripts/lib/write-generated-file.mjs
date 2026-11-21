import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

/** File watchers may briefly hold a replaced asset. Never retry other errors. */
export const withTransientFileRetry = async (operation, { attempts = 8, wait = delay, onRetry = () => {} } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!["EBUSY", "EPERM", "UNKNOWN"].includes(error.code) || attempt + 1 === attempts) throw error;
      onRetry(error, attempt + 1);
      await wait(250 * (attempt + 1));
    }
  }
  throw new Error("File retry requires at least one attempt");
};

/** Do not reopen unchanged outputs for writing; replace changed outputs whole. */
export const writeGeneratedFile = (filename, contents) => {
  const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, "utf8");
  try {
    if (fs.readFileSync(filename).equals(bytes)) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return true;
};
