import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE_ORIGIN = "https://www.eldenringatlas.com";
const OVERWOLF_URL = "https://www.overwolf.com/app/elden_ring_atlas-elden_ring_atlas";
const DISCORD_URL = "https://discord.gg/uJpFdUNzNt";
const RELEASE_DATE = "2026-08-10";

// Languages from build-seo-pages.mjs
const ALL_LANGS = ["en", "de", "es-419", "es", "fr", "pt", "it", "ja", "ko", "pl", "ru", "th", "zh-Hant", "zh-Hans"];

const shellPath = path.join(DIST, "app.html");
const shell = fs.readFileSync(shellPath, "utf8");

const itemsRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public", "data", "er-map", "elden-ring", "item-index.json"), "utf8")
);

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const absoluteUrl = (pathname) => `${SITE_ORIGIN}${pathname}`;

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const enCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "locales", "en.json"), "utf8")).seo;

// Prepare item data across all languages
const itemLocales = {}; // lang -> { catalog, overlay }
for (const lang of ALL_LANGS) {
  let localizedCatalog = {};
  if (lang !== "en") {
    localizedCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "locales", `${lang}.json`), "utf8")).seo;
  }
  
  const catalog = {
    common: { ...enCatalog.common, ...(localizedCatalog.common || {}) },
    home: { ...enCatalog.home, ...(localizedCatalog.home || {}) }
  };
  
  let overlay = null;
  if (lang !== "en") {
    try {
      overlay = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "generated", "i18n", `er-items.${lang}.json`), "utf8"));
    } catch (e) {
      // Ignored: Fallback to english keys if overlay is missing
    }
  }
  itemLocales[lang] = { catalog, overlay };
}

// English codex dataset (names/descriptions/stats) keyed the same group:id way
// as item-index keys — mirrors erGroup/erItemKey in src/data/er-items-data.ts.
const erGroup = (cat) =>
  cat === "weapon" ? "weapon"
  : cat === "armor" ? "armor"
  : cat === "talisman" ? "accessory"
  : cat === "ash-of-war" ? "gem"
  : "goods";
const erItemsData = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "data", "generated", "er-items.json"), "utf8")
);
const enItemByKey = new Map(erItemsData.items.map((i) => [`${erGroup(i.category)}:${i.id}`, i]));

// Location-kind labels for the static body (en-only by policy; locales get a later pass).
const KIND_LABELS = { treasure: "Treasure", shop: "Sold by", "npc-drop": "Dropped by", area: "Found in" };

/* Static, crawlable body injected INSIDE #root: Googlebot's first (raw-HTML) pass
 * sees a real page; when React mounts, createRoot().render() clears #root, so app
 * users never see this beyond the initial paint. Styles are self-contained because
 * app.html's CSS is the React bundle, not the marketing-page stylesheet. */
const SEO_BODY_STYLE = `<style>
#er-seo-static{position:fixed;inset:0;overflow:auto;z-index:40;background:#131109;color:#e7e0cf;font:16px/1.65 ui-sans-serif,system-ui,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
#er-seo-static .wrap{max-width:880px;margin:0 auto;padding:28px 20px 96px}
#er-seo-static a{color:#d9b968;text-decoration:none}
#er-seo-static a:hover{text-decoration:underline}
#er-seo-static h1{font-size:1.9rem;line-height:1.25;margin:.4rem 0 .3rem;color:#f3ecd9}
#er-seo-static h2{font-size:1.15rem;margin:1.8rem 0 .6rem;color:#f3ecd9}
#er-seo-static .crumbs{font-size:.85rem;color:#9d947e}
#er-seo-static .crumbs a{color:#b7ac90}
#er-seo-static .meta{font-size:.9rem;color:#9d947e;margin:0 0 1rem}
#er-seo-static .desc p{margin:.6rem 0;white-space:pre-line}
#er-seo-static ul{margin:.4rem 0 0;padding-left:1.2rem}
#er-seo-static li{margin:.35rem 0}
#er-seo-static .kind{display:inline-block;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;color:#8d8064;margin-right:.45rem}
#er-seo-static .note{color:#9d947e;font-size:.9rem}
#er-seo-static .cols{columns:2;column-gap:2.5rem}
@media (max-width:640px){#er-seo-static .cols{columns:1}}
#er-seo-static .cta{display:inline-block;margin:1.4rem 0 0;padding:.6rem 1.1rem;border:1px solid #d9b968;border-radius:8px;color:#d9b968}
#er-seo-static .topbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0 0 1.2rem;border-bottom:1px solid #2a2618;margin-bottom:1.4rem;flex-wrap:wrap}
#er-seo-static .brand{display:flex;align-items:center;gap:.5rem;font-weight:600;color:#f3ecd9}
#er-seo-static .topnav{display:flex;gap:1rem;flex-wrap:wrap;font-size:.9rem}
#er-seo-static footer{margin-top:3rem;padding-top:1rem;border-top:1px solid #2a2618;font-size:.85rem;color:#9d947e;display:flex;gap:1rem;flex-wrap:wrap}
</style>`;

const staticChrome = (catalog, langPrefix, inner) => {
  const t = catalog.common;
  const homeHref = langPrefix || "/";
  return `${SEO_BODY_STYLE}<div id="er-seo-static"><div class="wrap">
  <header class="topbar">
    <a class="brand" href="${homeHref}"><img src="/icon.png" width="24" height="24" alt="" />${escapeHtml(t.brand)}</a>
    <nav class="topnav">
      <a href="${langPrefix}/elden-ring">${escapeHtml(t.navEldenRing)}</a>
      <a href="${langPrefix}/shadow-of-the-erdtree">${escapeHtml(t.navDlc)}</a>
      <a href="${langPrefix}/nightreign">${escapeHtml(t.navNightreign)}</a>
      <a href="${langPrefix}/map">${escapeHtml(t.openMap)}</a>
    </nav>
  </header>
  <main>${inner}</main>
  <footer>
    <span>${escapeHtml(t.footerDisclaimer)}</span>
    <a href="${DISCORD_URL}" rel="noopener noreferrer">${escapeHtml(t.discord)}</a>
    <a href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(t.overwolf)}</a>
  </footer>
</div></div>`;
};

// The exact #root markup in app.html — withBody() throws if the shell drifts so a
// silent regression back to empty bodies can't ship.
const ROOT_DIV = '<div id="root" class="h-full w-full"></div>';
const withBody = (html, body) => {
  const next = html.replace(ROOT_DIV, `<div id="root" class="h-full w-full">${body}</div>`);
  if (next === html) throw new Error("app shell #root markup changed — update ROOT_DIV in build-seo-database.mjs");
  return next;
};

const header = (catalog, langPath) => {
  const t = catalog.common;
  return `
    <a class="skip-link" href="#main-content">${escapeHtml(t.skip)}</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="${langPath === "" ? "/" : langPath}" aria-label="${escapeHtml(t.brand)}">
          <img src="/icon.png" width="32" height="32" alt="" />
          <span class="brand-name">${escapeHtml(t.brand)}</span>
        </a>
        <nav class="site-nav" aria-label="Primary navigation">
          <a href="${langPath}/elden-ring">${escapeHtml(t.navEldenRing)}</a>
          <a href="${langPath}/shadow-of-the-erdtree">${escapeHtml(t.navDlc)}</a>
          <a href="${langPath}/nightreign">${escapeHtml(t.navNightreign)}</a>
          <a class="button button-primary" href="${langPath}/map">${escapeHtml(t.openMap)}</a>
        </nav>
      </div>
    </header>`;
};

const footer = (catalog) => {
  const t = catalog.common;
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <span>${escapeHtml(t.footerDisclaimer)}</span>
        <nav class="footer-nav" aria-label="Community and download links">
          <a href="${DISCORD_URL}" rel="noopener noreferrer">${escapeHtml(t.discord)}</a>
          <a href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(t.overwolf)}</a>
          <span>${escapeHtml(t.languages)}</span>
        </nav>
      </div>
    </footer>`;
};

// NitroPay web ads placement for consistency with contentBody
const nitroArticleAd = () =>
  `<script>window['nitroAds'].createAd('atlas-article',{"format":"article","articleOffsetTop":0,"pageInterval":1,` +
  `"report":{"enabled":true,"icon":true,"wording":"Report Ad","position":"top-right"}});</script>`;

// Inject data for the React app to read on boot
const scriptInjection = (itemKey, category) => {
  if (itemKey) return `\n    <script>window.__ER_SEO_ITEM__ = "${escapeHtml(itemKey)}";</script>`;
  if (category) return `\n    <script>window.__ER_SEO_CATEGORY__ = "${escapeHtml(category)}";</script>`;
  return `\n    <script>window.__ER_SEO_CATEGORY__ = "all";</script>`;
};

const hreflangTags = (pathFn) => {
  return ALL_LANGS.map(lang => {
    const prefix = lang === "en" ? "" : `/${lang}`;
    const url = absoluteUrl(`${prefix}${pathFn(lang)}`);
    const hreflang = lang === "en" ? "x-default" : lang;
    return `    <link rel="alternate" hreflang="${hreflang}" href="${url}" />\n` + 
           (lang === "en" ? `    <link rel="alternate" hreflang="en" href="${url}" />\n` : "");
  }).join("");
};

const headTags = (title, description, canonicalPath, imageUrl, schemaData, langPathFn) => {
  const canonical = absoluteUrl(canonicalPath);
  return `
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonical}" />
${hreflangTags(langPathFn)}    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeHtml(itemLocales["en"].catalog.common.brand)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <script type="application/ld+json">
    ${JSON.stringify(schemaData).replaceAll("<", "\\u003c")}
    </script>`;
};

// Organize items
const validItems = [];
const categories = new Set();
for (const [key, data] of Object.entries(itemsRaw)) {
  if (!data.locations || data.locations.length === 0) continue;
  const loc = data.locations[0];
  if (!loc.name || loc.name.trim() === "") continue;
  
  const category = loc.category || "unknown";
  categories.add(category);
  
  const typeId = key.split(":")[1] || key; // e.g. armor:812000 -> 812000
  
  validItems.push({
    key,
    typeId,
    category,
    region: loc.region,
    locationsCount: data.locations.length,
    enName: loc.name
  });
}

const countByCat = new Map();
for (const item of validItems) countByCat.set(item.category, (countByCat.get(item.category) || 0) + 1);

const allSeoUrls = [];
let totalGenerated = 0;

for (const lang of ALL_LANGS) {
  const { catalog, overlay } = itemLocales[lang];
  const langPrefix = lang === "en" ? "" : `/${lang}`;
  const outBase = path.join(DIST, langPrefix === "" ? "" : langPrefix.replace("/", ""));
  
  // 1. Categories Index
  const catItems = Array.from(categories).map(cat => ({
    name: cat.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    slug: cat,
    url: `${langPrefix}/items/${cat}`
  }));
  
  const catsIndexTitle = `Elden Ring Item Database | ${catalog.common.brand}`;
  const catsIndexDesc = `Browse all Elden Ring items, weapons, and armor by category.`;
  const catsIndexSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: absoluteUrl(`${langPrefix}/items`),
    name: catsIndexTitle,
    description: catsIndexDesc,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    dateModified: RELEASE_DATE
  };
  
  const catsIndexInner = `
      <nav class="crumbs"><a href="${langPrefix || "/"}">Home</a> › <span>Database</span></nav>
      <h1>Elden Ring Item Database</h1>
      <p class="meta">${validItems.length} items across ${categories.size} categories, every one placed on the interactive map.</p>
      <ul>${catItems.map((c) => `<li><a href="${c.url}">${escapeHtml(c.name)}</a> <span class="note">(${countByCat.get(c.slug) || 0})</span></li>`).join("")}</ul>
      <a class="cta" href="${langPrefix}/map">${escapeHtml(catalog.common.openMap)}</a>`;
  const catsHtml = withBody(
    shell
      .replace(/<html lang="[^"]*">/, `<html lang="${lang}" dir="ltr">`)
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(catsIndexTitle)}</title>${headTags(catsIndexTitle, catsIndexDesc, `${langPrefix}/items`, `${SITE_ORIGIN}/social/map.webp`, catsIndexSchema, () => `/items`)}${scriptInjection(null, "all")}`),
    staticChrome(catalog, langPrefix, catsIndexInner)
  );
    
  fs.mkdirSync(path.join(outBase, "items"), { recursive: true });
  fs.writeFileSync(path.join(outBase, "items", "index.html"), catsHtml);
  allSeoUrls.push(`${langPrefix}/items`);
  totalGenerated++;
  
  // 2. Individual Categories & Items
  for (const cat of categories) {
    const itemsInCat = validItems.filter(i => i.category === cat);
    const catName = cat.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    
    // Localized name + URL for every item in this category — reused by the
    // category hub list and each item page's "More in this category" links.
    const linksInCat = itemsInCat.map((i) => ({
      name: (overlay && overlay[i.key] && overlay[i.key].name) ? overlay[i.key].name : i.enName,
      url: `${langPrefix}/items/${cat}/${slugify(i.enName)}-${i.typeId}`,
    }));
    
    for (const [itemIdx, item] of itemsInCat.entries()) {
      const name = (overlay && overlay[item.key] && overlay[item.key].name) ? overlay[item.key].name : item.enName;
      const slug = slugify(item.enName); // Important: Keep slug in English so cross-language paths match!
      const urlPath = `${langPrefix}/items/${cat}/${slug}-${item.typeId}`;
      const canonicalPathFn = () => `/items/${cat}/${slug}-${item.typeId}`;
      
      
      const imageUrl = `${SITE_ORIGIN}/icons/elden-ring/items/${item.typeId}.png`;
      const title = `${name} | ${catalog.common.brand}`;
      const desc = `Find map locations, stats, and acquisition guides for ${name} in Elden Ring. View it on the interactive map.`;
      
      const schemaData = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        url: absoluteUrl(urlPath),
        name: title,
        description: desc,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        dateModified: RELEASE_DATE,
        breadcrumb: {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": absoluteUrl(`${langPrefix}/`) },
            { "@type": "ListItem", "position": 2, "name": "Database", "item": absoluteUrl(`${langPrefix}/items`) },
            { "@type": "ListItem", "position": 3, "name": catName, "item": absoluteUrl(`${langPrefix}/items/${cat}`) },
            { "@type": "ListItem", "position": 4, "name": name, "item": absoluteUrl(urlPath) }
          ]
        }
      };
      
      const entry = itemsRaw[item.key] || { locations: [], dropSources: [] };
      const enItem = enItemByKey.get(item.key);
      const longDesc =
        (overlay && overlay[item.key] && overlay[item.key].description) ||
        (enItem && enItem.description) ||
        "";
      const descHtml = longDesc
        ? `<div class="desc">${longDesc.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</div>`
        : "";
      const locs = entry.locations.slice(0, 20);
      const locList = locs
        .map((l) => {
          const label = KIND_LABELS[l.kind] || "Location";
          const where = [l.name, l.region].filter(Boolean).join(" — ");
          return `<li><span class="kind">${escapeHtml(label)}</span>${escapeHtml(where)}${l.note ? ` <span class="note">(${escapeHtml(l.note)})</span>` : ""}</li>`;
        })
        .join("");
      const moreLocs =
        entry.locations.length > locs.length
          ? `<li class="note">+${entry.locations.length - locs.length} more locations on the map</li>`
          : "";
      const drops = (entry.dropSources || [])
        .slice(0, 10)
        .map((d) => `<li><span class="kind">${escapeHtml(d.category === "boss" ? "Boss" : "Enemy")}</span>${escapeHtml([d.name, d.region].filter(Boolean).join(" — "))}${d.note ? ` <span class="note">(${escapeHtml(d.note)})</span>` : ""}</li>`)
        .join("");
      // Neighbouring items in the same category: internal links so crawlers can
      // walk the database without depending on the sitemap alone.
      const others = linksInCat.filter((_, j) => j !== itemIdx);
      const relStart = Math.min(Math.max(0, itemIdx - 6), Math.max(0, others.length - 12));
      const related = others.slice(relStart, relStart + 12);
      const itemInner = `
      <nav class="crumbs"><a href="${langPrefix || "/"}">Home</a> › <a href="${langPrefix}/items">Database</a> › <a href="${langPrefix}/items/${cat}">${escapeHtml(catName)}</a></nav>
      <h1>${escapeHtml(name)}</h1>
      <p class="meta">${escapeHtml(catName)} · Elden Ring</p>
      ${descHtml}
      ${locList ? `<h2>Where to find</h2><ul>${locList}${moreLocs}</ul>` : ""}
      ${drops ? `<h2>Dropped by</h2><ul>${drops}</ul>` : ""}
      <a class="cta" href="${langPrefix}/map">${escapeHtml(catalog.common.openMap)}</a>
      ${related.length ? `<h2>More ${escapeHtml(catName)}</h2><ul class="cols">${related.map((r) => `<li><a href="${r.url}">${escapeHtml(r.name)}</a></li>`).join("")}</ul>` : ""}`;
      const html = withBody(
        shell
          .replace(/<html lang="[^"]*">/, `<html lang="${lang}" dir="ltr">`)
          .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>${headTags(title, desc, urlPath, imageUrl, schemaData, canonicalPathFn)}${scriptInjection(item.key, null)}`),
        staticChrome(catalog, langPrefix, itemInner)
      );
        
      const outDir = path.join(outBase, "items", cat, `${slug}-${item.typeId}`);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, "index.html"), html);
      allSeoUrls.push(urlPath);
      totalGenerated++;
    }
    
    // Generate Category Index Page
    const catIndexTitle = `${catName} | ${catalog.common.brand}`;
    const catIndexDesc = `Browse all ${catName} in Elden Ring with interactive map locations.`;
    const catIndexSchema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      url: absoluteUrl(`${langPrefix}/items/${cat}`),
      name: catIndexTitle,
      description: catIndexDesc,
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      dateModified: RELEASE_DATE,
      breadcrumb: {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": absoluteUrl(`${langPrefix}/`) },
          { "@type": "ListItem", "position": 2, "name": "Database", "item": absoluteUrl(`${langPrefix}/items`) },
          { "@type": "ListItem", "position": 3, "name": catName, "item": absoluteUrl(`${langPrefix}/items/${cat}`) }
        ]
      }
    };
    
    const catIndexInner = `
      <nav class="crumbs"><a href="${langPrefix || "/"}">Home</a> › <a href="${langPrefix}/items">Database</a> › <span>${escapeHtml(catName)}</span></nav>
      <h1>${escapeHtml(catName)}</h1>
      <p class="meta">${linksInCat.length} ${escapeHtml(catName)} items in Elden Ring, each with map locations.</p>
      <ul class="cols">${linksInCat.map((l) => `<li><a href="${l.url}">${escapeHtml(l.name)}</a></li>`).join("")}</ul>
      <a class="cta" href="${langPrefix}/map">${escapeHtml(catalog.common.openMap)}</a>`;
    const catIndexHtml = withBody(
      shell
        .replace(/<html lang="[^"]*">/, `<html lang="${lang}" dir="ltr">`)
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(catIndexTitle)}</title>${headTags(catIndexTitle, catIndexDesc, `${langPrefix}/items/${cat}`, `${SITE_ORIGIN}/social/map.webp`, catIndexSchema, () => `/items/${cat}`)}${scriptInjection(null, cat)}`),
      staticChrome(catalog, langPrefix, catIndexInner)
    );
      
    fs.mkdirSync(path.join(outBase, "items", cat), { recursive: true });
    fs.writeFileSync(path.join(outBase, "items", cat, "index.html"), catIndexHtml);
    allSeoUrls.push(`${langPrefix}/items/${cat}`);
    totalGenerated++;
  }
}

fs.writeFileSync(path.join(DIST, "seo-database-urls.json"), JSON.stringify(allSeoUrls));

console.log(`Generated ${totalGenerated} item SEO pages and categories across ${ALL_LANGS.length} languages.`);
