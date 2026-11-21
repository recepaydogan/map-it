import assert from "node:assert/strict";
import {
  getRuntimeZomboidRootCandidates,
  getZomboidRootCandidates,
  saveConfiguredZomboidRoot,
} from "../src/features/live-bridge/live-bridge-paths.ts";

assert.deepEqual(
  getZomboidRootCandidates({
    localAppData: "C:\\Users\\Alice\\AppData\\Local",
    documents: "C:\\Users\\Alice\\Documents",
  }),
  [
    "C:\\Users\\Alice\\Zomboid",
    "C:\\Users\\Alice\\Documents\\Zomboid",
  ],
);

assert.deepEqual(
  getZomboidRootCandidates({
    localAppData: "C:\\Users\\Alice\\AppData\\Local",
    documents: "C:\\Users\\Alice\\OneDrive\\Documents",
  }),
  [
    "C:\\Users\\Alice\\Zomboid",
    "C:\\Users\\Alice\\OneDrive\\Documents\\Zomboid",
    "C:\\Users\\Alice\\OneDrive\\Zomboid",
  ],
);

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, value),
};
saveConfiguredZomboidRoot("D:/Games/PZ User/");
assert.deepEqual(
  getRuntimeZomboidRootCandidates({
    localAppData: "C:\\Users\\Alice\\AppData\\Local",
    documents: "C:\\Users\\Alice\\Documents",
  }),
  [
    "D:\\Games\\PZ User",
    "C:\\Users\\Alice\\Zomboid",
    "C:\\Users\\Alice\\Documents\\Zomboid",
  ],
);

console.log("Live Bridge installation path tests passed.");
