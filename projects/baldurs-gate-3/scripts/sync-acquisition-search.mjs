import fs from "node:fs";
import path from "node:path";
import { syncAcquisitionSearch } from "./lib/sync-acquisition-search.mjs";

const root = path.resolve(import.meta.dirname, "..");
const previousPath = process.argv[2];
if (!previousPath) throw new Error("Provide the retained previous item database path");
const previous = JSON.parse(fs.readFileSync(path.resolve(previousPath), "utf8"));
const current = JSON.parse(fs.readFileSync(path.join(root, "public/data/item-database.json"), "utf8"));
console.log("Acquisition search synchronization:", syncAcquisitionSearch(previous.items, current.items, path.join(root, "public/maps")));
