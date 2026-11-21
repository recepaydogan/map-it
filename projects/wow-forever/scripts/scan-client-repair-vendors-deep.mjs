/** Rebuild name-independent repair-vendor evidence from the installed client. */
const stages = [
  "scan-client-spatial-tables.mjs",
  "scan-client-service-spatial-joins.mjs",
  "extract-client-service-object-candidates.mjs",
  "trace-client-commercial-sites.mjs",
  "trace-client-wmo-service-doodads.mjs",
  "trace-client-active-service-doodads.mjs",
];

for (const stage of stages) {
  console.log(`\n${stage}`);
  await import(new URL(stage, import.meta.url));
}
