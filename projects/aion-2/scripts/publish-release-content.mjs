import { execSync } from "node:child_process";
import path from "node:path";
import { loadEnv } from "vite";
import { createReleaseContentPlan } from "./release-content.mjs";
import { uploadReleaseContent } from "./upload-release-content.mjs";

const root = path.resolve(import.meta.dirname, "..");

// Generated data must be final before its immutable fingerprint is published.
execSync("npm run prebuild", { cwd: root, stdio: "inherit" });
const plan = await createReleaseContentPlan(path.join(root, "public"));
await uploadReleaseContent(plan, loadEnv("production", root, ""));
