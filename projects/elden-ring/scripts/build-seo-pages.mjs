import fs from "node:fs";
import path from "node:path";
import { indexNowConfig, indexNowKeyFileName } from "./indexnow-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist");
const SITE_ORIGIN = "https://www.eldenringatlas.com";
const OVERWOLF_URL = "https://www.overwolf.com/app/elden_ring_atlas-elden_ring_atlas";
const DISCORD_URL = "https://discord.gg/uJpFdUNzNt";
/** Public contact route required by the privacy policy (GDPR/CCPA data requests).
 *  Swap for a domain mailbox (e.g. privacy@eldenringatlas.com) once one exists. */
const CONTACT_EMAIL = "rastudio316@gmail.com";
const RELEASE_DATE = "2026-08-10";
const LOCALIZED_LANGUAGE_CODES = [
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

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src", "i18n", "locales", "en.json"), "utf8"),
).seo;
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const shellPath = path.join(DIST, "index.html");
const shell = fs.readFileSync(shellPath, "utf8");

const pages = [
  { key: "home", path: "/", kind: "home" },
  { key: "eldenRing", path: "/elden-ring", kind: "content" },
  { key: "dlc", path: "/shadow-of-the-erdtree", kind: "content" },
  { key: "nightreign", path: "/nightreign", kind: "content" },
  { key: "patterns", path: "/nightreign/map-patterns", kind: "content" },
  { key: "privacy", path: "/privacy", kind: "legal" },
];

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const absoluteUrl = (pathname) => `${SITE_ORIGIN}${pathname === "/" ? "" : pathname}`;

const localizedHomePath = (code) => `/${code}`;

const homeAlternates = () => `
    <link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}" />
    <link rel="alternate" hreflang="en" href="${SITE_ORIGIN}" />
${LOCALIZED_LANGUAGE_CODES.map((code) => `    <link rel="alternate" hreflang="${code}" href="${absoluteUrl(localizedHomePath(code))}" />`).join("\n")}`;

const header = () => {
  const t = catalog.common;
  return `
    <a class="skip-link" href="#main-content">${escapeHtml(t.skip)}</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/" aria-label="${escapeHtml(t.brand)}">
          <img src="/icon.png" width="32" height="32" alt="" />
          <span class="brand-name">${escapeHtml(t.brand)}</span>
        </a>
        <nav class="site-nav" aria-label="Primary navigation">
          <a href="/elden-ring">${escapeHtml(t.navEldenRing)}</a>
          <a href="/shadow-of-the-erdtree">${escapeHtml(t.navDlc)}</a>
          <a href="/nightreign">${escapeHtml(t.navNightreign)}</a>
          <a class="button button-primary" href="/map">${escapeHtml(t.openMap)}</a>
        </nav>
      </div>
    </header>`;
};

/** Registers the in-content unit for the #atlas-article container above it
 *  (Nitro panel placement "atlas-article"). Content pages only. */
const nitroArticleAd = () =>
  `<script>window['nitroAds'].createAd('atlas-article',{"format":"article","articleOffsetTop":0,"pageInterval":1,` +
  `"report":{"enabled":true,"icon":true,"wording":"Report Ad","position":"top-right"}});</script>`;

const cta = () => {
  const t = catalog.common;
  return `
    <section class="section" aria-labelledby="cta-title">
      <div class="cta-panel">
        <div>
          <h2 id="cta-title">${escapeHtml(t.ctaTitle)}</h2>
          <p>${escapeHtml(t.ctaBody)}</p>
        </div>
        <div class="hero-actions">
          <a class="button button-primary" href="/map">${escapeHtml(t.openMap)}</a>
          <a class="button button-secondary" href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(t.getApp)}</a>
        </div>
      </div>
    </section>`;
};

const footer = () => {
  const t = catalog.common;
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <span>${escapeHtml(t.footerDisclaimer)}</span>
        <nav class="footer-nav" aria-label="Community and download links">
          <a href="${DISCORD_URL}" rel="noopener noreferrer">${escapeHtml(t.discord)}</a>
          <a href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(t.overwolf)}</a>
          <a href="/privacy">${escapeHtml(t.privacy)}</a>
          <!-- NitroPay CMP injects a "manage consent" button here for EU/EEA/UK
               visitors, and a CCPA opt-out link into the span for California
               residents. Both stay empty (and invisible) for everyone else. -->
          <div id="ncmp-consent-link"></div>
          <span data-ccpa-link="1"></span>
          <span>${escapeHtml(t.languages)}</span>
        </nav>
      </div>
    </footer>`;
};

const homeBody = (t) => `
  ${header()}
  <main id="main-content">
    <section class="hero">
      <div>
        <p class="eyebrow">${escapeHtml(t.eyebrow)}</p>
        <h1>${escapeHtml(t.heading)}</h1>
        <p class="hero-lead">${escapeHtml(t.lead)}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="/map">${escapeHtml(catalog.common.openMap)}</a>
          <a class="button button-secondary" href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(catalog.common.getApp)}</a>
        </div>
      </div>
      <div class="hero-visual">
        <img src="/social/map.webp" width="1200" height="675" alt="Elden Ring Atlas interactive map showing locations and filters" fetchpriority="high" />
      </div>
    </section>
    <section class="stats" aria-label="Atlas dataset coverage">
      <div class="stat"><strong class="stat-value">3,267</strong><span class="stat-label">${escapeHtml(t.statMarkers)}</span></div>
      <div class="stat"><strong class="stat-value">3,685</strong><span class="stat-label">${escapeHtml(t.statItems)}</span></div>
      <div class="stat"><strong class="stat-value">320</strong><span class="stat-label">${escapeHtml(t.statPatterns)}</span></div>
      <div class="stat"><strong class="stat-value">14</strong><span class="stat-label">${escapeHtml(t.statLanguages)}</span></div>
    </section>
    <section class="section" aria-labelledby="features-title">
      <div class="section-heading">
        <p class="eyebrow">${escapeHtml(catalog.common.features)}</p>
        <h2 class="section-title" id="features-title">${escapeHtml(t.sectionTitle)}</h2>
        <p class="section-copy">${escapeHtml(t.sectionBody)}</p>
      </div>
      <div class="feature-grid">
        <article class="feature-card"><span class="feature-card-kicker">${escapeHtml(t.featureOneKicker)}</span><h3>${escapeHtml(t.featureOneTitle)}</h3><p>${escapeHtml(t.featureOneBody)}</p></article>
        <article class="feature-card"><span class="feature-card-kicker">${escapeHtml(t.featureTwoKicker)}</span><h3>${escapeHtml(t.featureTwoTitle)}</h3><p>${escapeHtml(t.featureTwoBody)}</p></article>
        <article class="feature-card"><span class="feature-card-kicker">${escapeHtml(t.featureThreeKicker)}</span><h3>${escapeHtml(t.featureThreeTitle)}</h3><p>${escapeHtml(t.featureThreeBody)}</p></article>
      </div>
    </section>
    ${cta()}
  </main>
  ${footer()}`;

const contentBody = (t) => `
  ${header()}
  <main id="main-content">
    <header class="content-hero">
      <p class="eyebrow">${escapeHtml(t.eyebrow)}</p>
      <h1>${escapeHtml(t.heading)}</h1>
      <p class="content-lead">${escapeHtml(t.lead)}</p>
      <div class="hero-actions"><a class="button button-primary" href="/map">${escapeHtml(catalog.common.openMap)}</a></div>
    </header>
    <!-- NitroPay "article" unit: the reading flow below is the container Nitro
         threads in-content ads through (web-only; the loader lives in the shell head). -->
    <div id="atlas-article">
    <section class="section" aria-labelledby="facts-title">
      <div class="section-heading">
        <p class="eyebrow">${escapeHtml(catalog.common.facts)}</p>
        <h2 class="section-title" id="facts-title">${escapeHtml(t.sectionTitle)}</h2>
        <p class="section-copy">${escapeHtml(t.sectionBody)}</p>
      </div>
      <ul class="fact-list">
        <li><strong>${escapeHtml(t.factOne)}</strong></li>
        <li><strong>${escapeHtml(t.factTwo)}</strong></li>
        <li><strong>${escapeHtml(t.factThree)}</strong></li>
        <li><strong>${escapeHtml(t.factFour)}</strong></li>
      </ul>
    </section>
    <section class="section" aria-labelledby="faq-title">
      <div class="section-heading"><p class="eyebrow">FAQ</p><h2 class="section-title" id="faq-title">${escapeHtml(catalog.common.faq)}</h2></div>
      <div class="faq">
        <details open><summary>${escapeHtml(t.faqOneQuestion)}</summary><p>${escapeHtml(t.faqOneAnswer)}</p></details>
        <details><summary>${escapeHtml(t.faqTwoQuestion)}</summary><p>${escapeHtml(t.faqTwoAnswer)}</p></details>
      </div>
    </section>
    </div>
    ${nitroArticleAd()}
    ${cta()}
  </main>
  ${footer()}`;

const legalSection = (section) => `
    <section class="section">
      <div class="section-heading">
        <h2 class="section-title">${escapeHtml(section.title)}</h2>
        ${section.body ? `<p class="section-copy">${escapeHtml(section.body)}</p>` : ""}
      </div>
      ${section.items?.length
        ? `<ul class="fact-list legal-list">${section.items
            .map((item) => `<li><strong>${escapeHtml(item.term)}</strong> — ${escapeHtml(item.text)}</li>`)
            .join("")}</ul>`
        : ""}
    </section>`;

/** Long-form legal page (privacy policy). Deliberately carries NO in-content ad:
 *  threading ads through a consent disclosure is exactly what an ad-network
 *  compliance review flags. */
const legalBody = (t) => `
  ${header()}
  <main id="main-content">
    <header class="content-hero">
      <p class="eyebrow">${escapeHtml(t.eyebrow)}</p>
      <h1>${escapeHtml(t.heading)}</h1>
      <p class="content-lead">${escapeHtml(t.lead)}</p>
      <p class="legal-updated">${escapeHtml(t.updated)}</p>
    </header>
    ${t.sections.map(legalSection).join("")}
    <section class="section">
      <div class="section-heading">
        <h2 class="section-title">${escapeHtml(t.choicesTitle)}</h2>
        <p class="section-copy">${escapeHtml(t.choicesBody)}</p>
      </div>
      <div class="privacy-controls">
        <div id="ncmp-consent-link"></div>
        <span data-ccpa-link="1"></span>
      </div>
    </section>
    <section class="section">
      <div class="section-heading">
        <h2 class="section-title">${escapeHtml(t.contactTitle)}</h2>
        <p class="section-copy">${escapeHtml(t.contactBody)} <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
      </div>
      <p class="section-copy">${escapeHtml(t.disclaimer)}</p>
    </section>
  </main>
  ${footer()}`;

const softwareApplicationSchema = {
  "@type": "SoftwareApplication",
  name: catalog.common.brand,
  applicationCategory: "GameApplication",
  applicationSubCategory: "Game companion",
  operatingSystem: "Web, Windows 10, Windows 11",
  softwareVersion: packageJson.version,
  dateModified: RELEASE_DATE,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  downloadUrl: OVERWOLF_URL,
  screenshot: `${SITE_ORIGIN}/social/map.webp`,
  featureList: [
    "Interactive maps for Elden Ring, Shadow of the Erdtree and Nightreign",
    "Boss weaknesses, resistances and practical build guidance",
    "Item locations, stats and acquisition sources",
    "Nightreign map pattern finder",
    "Progress tracking, bookmarks and custom pins",
  ],
};

const structuredData = (page, t) => {
  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: catalog.common.brand,
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/icon.png`,
      sameAs: [OVERWOLF_URL, DISCORD_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      name: catalog.common.brand,
      url: SITE_ORIGIN,
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      inLanguage: "en",
    },
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl(page.path)}#webpage`,
      url: absoluteUrl(page.path),
      name: t.title,
      description: t.description,
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      about: { "@id": `${SITE_ORIGIN}/#software` },
      inLanguage: "en",
      dateModified: RELEASE_DATE,
    },
    { ...softwareApplicationSchema, "@id": `${SITE_ORIGIN}/#software` },
  ];

  if (page.kind === "content") {
    graph.push({
      "@type": "FAQPage",
      "@id": `${absoluteUrl(page.path)}#faq`,
      mainEntity: [
        { "@type": "Question", name: t.faqOneQuestion, acceptedAnswer: { "@type": "Answer", text: t.faqOneAnswer } },
        { "@type": "Question", name: t.faqTwoQuestion, acceptedAnswer: { "@type": "Answer", text: t.faqTwoAnswer } },
      ],
    });
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
};

const headTags = (page, t) => {
  const canonical = absoluteUrl(page.path);
  const title = escapeHtml(t.title);
  const description = escapeHtml(t.description);
  return `
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(catalog.common.brand)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_ORIGIN}/social/map.webp" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="675" />
    <meta property="og:image:alt" content="Elden Ring Atlas interactive map" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE_ORIGIN}/social/map.webp" />
    <script type="application/ld+json">${structuredData(page, t)}</script>`;
};

const renderPage = (page) => {
  const t = catalog[page.key];
  const body = page.kind === "home"
    ? homeBody(t)
    : page.kind === "legal"
      ? legalBody(t)
      : contentBody(t);
  const alternates = page.path === "/" ? homeAlternates() : "";
  return shell
    .replace('<html lang="en">', '<html lang="en" dir="ltr">')
    .replace("<title>Elden Ring Atlas</title>", `<title>${escapeHtml(t.title)}</title>${headTags(page, t)}${alternates}`)
    .replace('<div id="seo-page"></div>', `<div id="seo-page">${body}</div>`);
};

const outputPathFor = (pathname) =>
  pathname === "/" ? shellPath : path.join(DIST, ...pathname.slice(1).split("/"), "index.html");

for (const page of pages) {
  const outputPath = outputPathFor(page.path);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, renderPage(page));
}

const localizedHomeBody = (localized) => {
  const common = { ...catalog.common, ...localized.common };
  const t = { ...catalog.home, ...localized.home };
  return `
    <a class="skip-link" href="#main-content">${escapeHtml(common.skip)}</a>
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="/" aria-label="${escapeHtml(common.brand)}">
          <img src="/icon.png" width="32" height="32" alt="" />
          <span class="brand-name">${escapeHtml(common.brand)}</span>
        </a>
        <nav class="site-nav" aria-label="Primary navigation">
          <a class="button button-primary" href="/map">${escapeHtml(common.openMap)}</a>
        </nav>
      </div>
    </header>
    <main id="main-content">
      <section class="hero">
        <div>
          <p class="eyebrow">${escapeHtml(t.eyebrow)}</p>
          <h1>${escapeHtml(t.heading)}</h1>
          <p class="hero-lead">${escapeHtml(t.lead)}</p>
          <div class="hero-actions">
            <a class="button button-primary" href="/map">${escapeHtml(common.openMap)}</a>
            <a class="button button-secondary" href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(common.getApp)}</a>
          </div>
        </div>
        <div class="hero-visual">
          <img src="/social/map.webp" width="1200" height="675" alt="Elden Ring Atlas" fetchpriority="high" />
        </div>
      </section>
      <section class="stats" aria-label="Atlas dataset coverage">
        <div class="stat"><strong class="stat-value">3,267</strong><span class="stat-label">${escapeHtml(t.statMarkers)}</span></div>
        <div class="stat"><strong class="stat-value">3,685</strong><span class="stat-label">${escapeHtml(t.statItems)}</span></div>
        <div class="stat"><strong class="stat-value">320</strong><span class="stat-label">${escapeHtml(t.statPatterns)}</span></div>
        <div class="stat"><strong class="stat-value">14</strong><span class="stat-label">${escapeHtml(t.statLanguages)}</span></div>
      </section>
      <section class="section">
        <div class="cta-panel">
          <div class="hero-actions">
            <a class="button button-primary" href="/map">${escapeHtml(common.openMap)}</a>
            <a class="button button-secondary" href="${OVERWOLF_URL}" rel="noopener noreferrer">${escapeHtml(common.getApp)}</a>
          </div>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <span>${escapeHtml(common.brand)}</span>
        <nav class="footer-nav" aria-label="Legal links">
          <a href="/privacy">${escapeHtml(common.privacy)}</a>
          <div id="ncmp-consent-link"></div>
          <span data-ccpa-link="1"></span>
        </nav>
      </div>
    </footer>`;
};

const localizedHead = (code, localized) => {
  const t = { ...catalog.home, ...localized.home };
  const canonical = absoluteUrl(localizedHomePath(code));
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: canonical,
    name: t.title,
    description: t.description,
    inLanguage: code,
    isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
    about: { "@id": `${SITE_ORIGIN}/#software` },
    dateModified: RELEASE_DATE,
  }).replaceAll("<", "\\u003c");
  return `<title>${escapeHtml(t.title)}</title>
    <meta name="description" content="${escapeHtml(t.description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <link rel="canonical" href="${canonical}" />${homeAlternates()}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(catalog.common.brand)}" />
    <meta property="og:title" content="${escapeHtml(t.title)}" />
    <meta property="og:description" content="${escapeHtml(t.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_ORIGIN}/social/map.webp" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${schema}</script>`;
};

for (const code of LOCALIZED_LANGUAGE_CODES) {
  const localePath = path.join(ROOT, "src", "i18n", "locales", `${code}.json`);
  const localized = JSON.parse(fs.readFileSync(localePath, "utf8")).seo;
  if (!localized?.common || !localized?.home) {
    throw new Error(`Missing localized SEO catalog in ${path.relative(ROOT, localePath)}`);
  }
  const outputPath = path.join(DIST, code, "index.html");
  const html = shell
    .replace('<html lang="en">', `<html lang="${code}" dir="ltr">`)
    .replace("<title>Elden Ring Atlas</title>", localizedHead(code, localized))
    .replace('<div id="seo-page"></div>', `<div id="seo-page">${localizedHomeBody(localized)}</div>`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
}

const socialDir = path.join(DIST, "social");
fs.mkdirSync(socialDir, { recursive: true });
fs.copyFileSync(
  path.join(ROOT, "brand", "erstoreassets", "store", "1-map.webp"),
  path.join(socialDir, "map.webp"),
);

let databaseUrls = [];
try {
  databaseUrls = JSON.parse(fs.readFileSync(path.join(DIST, "seo-database-urls.json"), "utf8"));
} catch (e) {
  // Ignore if not present
}

const sitemapUrls = [
  "/",
  "/map",
  ...pages.slice(1).map((page) => page.path),
  ...LOCALIZED_LANGUAGE_CODES.map(localizedHomePath),
  ...databaseUrls
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((pathname) => `  <url><loc>${absoluteUrl(pathname)}</loc><lastmod>${RELEASE_DATE}</lastmod></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(DIST, "sitemap.xml"), sitemap);
fs.writeFileSync(path.join(DIST, indexNowKeyFileName), `${indexNowConfig.key}\n`);

const robots = `User-agent: *
Allow: /
Disallow: /map/account
Disallow: /map/settings
Disallow: /map/support
Disallow: /map/notes-admin

User-agent: OAI-SearchBot
Allow: /

User-agent: GPTBot
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
fs.writeFileSync(path.join(DIST, "robots.txt"), robots);

const llms = `# Elden Ring Atlas

> A free, fan-made interactive map and game companion for Elden Ring, Shadow of the Erdtree and Elden Ring Nightreign.

## Primary resources

- [Elden Ring Atlas](${SITE_ORIGIN}/): Product overview and dataset coverage
- [Interactive map](${SITE_ORIGIN}/map): Searchable maps, item database, boss intel and progress tracking
- [Elden Ring toolkit](${SITE_ORIGIN}/elden-ring): Elden Ring maps, items, bosses and build tools
- [Shadow of the Erdtree](${SITE_ORIGIN}/shadow-of-the-erdtree): Realm of Shadow map and DLC locations
- [Nightreign](${SITE_ORIGIN}/nightreign): Map patterns, Nightlords, Nightfarers, relics and weapons
- [Nightreign map patterns](${SITE_ORIGIN}/nightreign/map-patterns): Pattern finder for expedition layouts

## Coverage

- 3,267 Elden Ring location records, including 206 Realm of Shadow locations
- 3,685 Elden Ring item records
- 320 Nightreign map patterns and 592 Nightreign weapons
- User interface and game data available in 14 languages

## Attribution

Elden Ring Atlas is fan-made and is not affiliated with FromSoftware or Bandai Namco Entertainment.
`;
fs.writeFileSync(path.join(DIST, "llms.txt"), llms);

const appPath = path.join(DIST, "app.html");
if (fs.existsSync(appPath)) {
  const appHtml = fs.readFileSync(appPath, "utf8");
  const mapPage = { key: "home", path: "/map", kind: "home" };
  const mapTitle = "Elden Ring Atlas Interactive Map";
  const mapDescription = catalog.home.description;
  const mapHead = headTags(mapPage, { ...catalog.home, title: mapTitle, description: mapDescription });
  fs.writeFileSync(
    appPath,
    appHtml.replace("<title>Elden Ring Atlas</title>", `<title>${mapTitle}</title>${mapHead}`),
  );
}

console.log(
  `Generated ${pages.length + LOCALIZED_LANGUAGE_CODES.length} static SEO pages, sitemap.xml, robots.txt, llms.txt and the IndexNow key.`,
);
