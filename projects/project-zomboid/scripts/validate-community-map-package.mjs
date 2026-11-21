import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaPath = resolve("schema", "community-map-package.schema.json");
const packagePath = resolve(process.argv[2] ?? "schema/community-map-package.example.json");
const [schema, communityPackage] = await Promise.all([
  readFile(schemaPath, "utf8").then(JSON.parse),
  readFile(packagePath, "utf8").then(JSON.parse),
]);

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const hasValidBounds = communityPackage.map?.bounds
  && communityPackage.map.bounds.maxX > communityPackage.map.bounds.minX
  && communityPackage.map.bounds.maxY > communityPackage.map.bounds.minY;

if (!validate(communityPackage) || !hasValidBounds) {
  console.error(validate.errors);
  if (!hasValidBounds) console.error("Community map bounds must have positive width and height.");
  process.exitCode = 1;
} else {
  if (!process.argv[2]) {
    const invalidPermissionPackage = structuredClone(communityPackage);
    invalidPermissionPackage.rights.permissionStatus = "explicit";
    delete invalidPermissionPackage.rights.permissionEvidenceUrl;
    if (validate(invalidPermissionPackage)) {
      throw new Error("Explicit third-party permission must require an evidence URL.");
    }
  }
  console.log(`Community map package is valid: ${packagePath}`);
}
