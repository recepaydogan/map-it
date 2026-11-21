import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE_ORIGIN = "https://www.eldenringatlas.com";
const languageCodes = [
  "de",
  "es-419",
  "es",
  "fr",
  "pt",
  "it",
  "ja",
  "ko",
  "pl",
  "ru",
  "th",
  "zh-Hant",
  "zh-Hans",
];
const pagePaths = [
  "/",
  "/elden-ring",
  "/shadow-of-the-erdtree",
  "/nightreign",
  "/nightreign/map-patterns",
  "/privacy",
  ...languageCodes.map((code) => `/${code}`),
];

let errors = 0;

const fail = (message) => {
  console.error(`  ERROR: ${message}`);
  errors += 1;
};

const ok = (message) => console.log(`  OK:    ${message}`);

const fileForPage = (pathname) =>
  pathname === "/"
    ? path.join(DIST, "index.html")
    : path.join(DIST, ...pathname.slice(1).split("/"), "index.html");

const requirePattern = (html, pattern, message) => {
  if (!pattern.test(html)) fail(message);
};

console.log("--- Static SEO Validation ---\n");

for (const pathname of pagePaths) {
  const filePath = fileForPage(pathname);
  if (!fs.existsSync(filePath)) {
    fail(`${pathname}: generated HTML is missing`);
    continue;
  }
  const html = fs.readFileSync(filePath, "utf8");
  requirePattern(html, /<title>[^<]{20,}<\/title>/, `${pathname}: descriptive title is missing`);
  const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
  const minimumDescriptionLength = pathname.startsWith("/zh-") ? 35 : 80;
  if (description.length < minimumDescriptionLength) {
    fail(`${pathname}: meta description is missing or too short`);
  }
  requirePattern(html, /<link rel="canonical" href="https:\/\/www\.eldenringatlas\.com[^"<]*"/, `${pathname}: canonical URL is missing`);
  requirePattern(html, /<h1>[^<]+<\/h1>/, `${pathname}: visible h1 is missing`);
  requirePattern(html, /<script type="application\/ld\+json">/, `${pathname}: JSON-LD is missing`);

  for (const match of html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)) {
    try {
      JSON.parse(match[1]);
    } catch {
      fail(`${pathname}: JSON-LD is invalid JSON`);
    }
  }

  if (pathname === "/" || languageCodes.some((code) => pathname === `/${code}`)) {
    const alternateCount = (html.match(/rel="alternate" hreflang=/g) ?? []).length;
    if (alternateCount !== languageCodes.length + 2) {
      fail(`${pathname}: expected ${languageCodes.length + 2} hreflang links, found ${alternateCount}`);
    }
  }
}

if (errors === 0) ok(`${pagePaths.length} static pages contain indexable content and valid metadata`);

const indexHtml = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
// The NitroPay loader (web ads, injected by the nitropayAds vite plugin) is the
// one sanctioned third-party script on the landing page; everything else must
// still be the isolated analytics client.
const NITRO_LOADER = "https://s.nitropay.com/ads-";
const landingScripts = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((src) => !src.startsWith(NITRO_LOADER));
const landingScriptPath = landingScripts[0]?.startsWith("/assets/")
  ? path.join(DIST, landingScripts[0].slice(1))
  : null;
const landingScriptSize = landingScriptPath && fs.existsSync(landingScriptPath)
  ? fs.statSync(landingScriptPath).size
  : Number.POSITIVE_INFINITY;
if (landingScripts.length !== 1 || !/\/assets\/index-[^/]+\.js$/.test(landingScripts[0]) || landingScriptSize > 10_000) {
  fail("Landing page loads a script other than the isolated analytics client");
} else {
  ok("Landing content is static and only loads the isolated analytics client");
}

const robotsPath = path.join(DIST, "robots.txt");
const sitemapPath = path.join(DIST, "sitemap.xml");
const llmsPath = path.join(DIST, "llms.txt");
for (const filePath of [robotsPath, sitemapPath, llmsPath]) {
  if (!fs.existsSync(filePath)) fail(`${path.basename(filePath)} is missing`);
}

if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, "utf8");
  requirePattern(robots, /User-agent: OAI-SearchBot\s+Allow: \//, "robots.txt does not explicitly allow OAI-SearchBot");
  requirePattern(robots, new RegExp(`Sitemap: ${SITE_ORIGIN.replaceAll(".", "\\.")}\/sitemap\\.xml`), "robots.txt does not advertise the sitemap");
}

if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  // Presence, not an exact count: the sitemap also carries the item-database
  // pages (dist/seo-database-urls.json, ~15k URLs), so a hardcoded total was
  // only ever right in builds where that step had not run.
  const expected = [...pagePaths, "/map"].map((pathname) =>
    pathname === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${pathname}`);
  const missing = expected.filter((url) => !sitemap.includes(`<loc>${url}</loc>`));
  const total = (sitemap.match(/<url>/g) ?? []).length;
  if (missing.length) fail(`sitemap.xml is missing ${missing.length} canonical URL(s): ${missing.join(", ")}`);
  else ok(`sitemap.xml lists all ${expected.length} canonical URLs (${total} entries incl. item database)`);
}

const appSource = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
requirePattern(appSource, /<div id="root" class="h-full w-full"><\/div>/, "app.html no longer contains the preserved React root");
requirePattern(appSource, /src="\/src\/main\.tsx"/, "app.html no longer boots the shared product entry");

console.log("\n--- Summary ---");
console.log(`Errors: ${errors}`);
if (errors > 0) process.exit(1);
console.log("SEO artifacts are structurally valid.");
