import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const source = resolve(projectRoot, "bridge-mod", "ProjectZomboidInteractiveMap");
const destinationRoot = resolve(projectRoot, "dist", "bridge-mod");
const destination = resolve(destinationRoot, "ProjectZomboidInteractiveMap");

rmSync(destination, { force: true, recursive: true });
mkdirSync(destinationRoot, { recursive: true });
cpSync(source, destination, { recursive: true });

console.log(`Bridge mod copied to ${destination}`);
