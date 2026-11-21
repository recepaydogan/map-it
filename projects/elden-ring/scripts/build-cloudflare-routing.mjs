import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv[2] ?? path.join(root, "dist"));
const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));

// Keep Vercel as the shared source of routing rules during the migration.
// Only the web build runs this script; nothing is added to public/.
const sourcePattern = (source) => {
  const pattern = source.replace(/\/:[A-Za-z]\w*\*$/, "/*").replace(/\(\.\*\)$/, "*");
  if (!pattern.startsWith("/") || /[():?]/.test(pattern)) {
    throw new Error(`Unsupported Cloudflare source pattern: ${source}`);
  }
  return pattern;
};

const redirects = config.redirects.map(({ source, destination, statusCode, permanent }) => {
  const status = statusCode ?? (permanent ? 308 : 307);
  return `${sourcePattern(source)} ${destination} ${status}`;
});
const rewrites = config.rewrites.map(({ source, destination }) =>
  // Cloudflare canonicalizes .html URLs before serving them, even in rewrites.
  `${sourcePattern(source)} ${destination.replace(/\.html$/, "")} 200`,
);
const headers = config.headers.map(({ source, headers: values }) =>
  [sourcePattern(source), ...values.map(({ key, value }) => `  ${key}: ${value}`)].join("\n"),
);

// Fail if this is not a completed web output directory.
for (const filename of ["index.html", "app.html", "sitemap.xml"]) {
  if (!fs.existsSync(path.join(output, filename))) {
    throw new Error(`Missing web build artifact: ${path.join(output, filename)}`);
  }
}

fs.writeFileSync(path.join(output, "_redirects"), [...redirects, ...rewrites, ""].join("\n"));
fs.writeFileSync(path.join(output, "_headers"), `${headers.join("\n\n")}\n`);
console.log(`Generated Cloudflare routing: ${redirects.length} redirects, ${rewrites.length} rewrites, ${headers.length} header rules.`);
