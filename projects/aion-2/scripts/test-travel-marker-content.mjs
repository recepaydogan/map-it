import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, readdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const output = await build({
  stdin: {
    contents: `
      import { createElement } from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { createInstance } from 'i18next';
      import { I18nextProvider } from 'react-i18next';
      import Content from './src/features/reference/travel-marker-content';
      import en from './src/i18n/locales/en.json';
      const i18n = createInstance();
      i18n.init({ lng: 'en', resources: { en: { translation: en } }, initImmediate: false });
      export const render = (entries, marker) => renderToStaticMarkup(
        createElement(I18nextProvider, { i18n }, createElement(Content, { entries, marker }))
      );`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  define: { "import.meta.env": JSON.stringify({ BASE_URL: "/" }) },
});
const directory = await mkdtemp(join(tmpdir(), "travel-marker-test-"));
const bundle = join(directory, "render.cjs");
try {
  await writeFile(bundle, output.outputFiles[0].contents);
  const { render } = createRequire(import.meta.url)(bundle);
  const entries = {};
  for (const name of await readdir("public/data/reference/travel")) {
    Object.assign(entries, JSON.parse(await readFile(`public/data/reference/travel/${name}`, "utf8")).entries);
  }
  let checked = 0;
  for (const entry of Object.values(entries).filter((entry) => entry.travel?.kind === "teleport")) {
    for (const marker of entry.locations) {
      const html = render([entry], marker);
      assert.doesNotMatch(html, /Fast travel/, `Waypoint must not repeat the category heading: ${entry.id}`);
      assert.match(html, /Once unlocked, you can teleport here from elsewhere on the map using the travel item listed below/, `Waypoint must explain incoming travel: ${entry.id}`);
      assert.doesNotMatch(html, /<button[^>]*>Access and requirements<\/button/, `Waypoint details must be inline: ${entry.id}`);
      assert.doesNotMatch(html, />Destination</, `Waypoint must not show a destination card: ${entry.id}`);
      assert.doesNotMatch(html, /underline|<destination>/, `Waypoint explanation must be plain text: ${entry.id}`);
      assert.match(html, /Access and requirements/);
      if (entry.facts.some((fact) => fact.label === "reference.labels.unlock-method")) assert.match(html, /Unlock method/);
      if (entry.facts.some((fact) => fact.label === "reference.labels.faction")) assert.match(html, /Faction/);
      const cost = entry.sections.find((section) => section.title === "reference.labels.travel-cost");
      if (cost?.links?.length) {
        assert.equal((html.match(/Travel cost/g) ?? []).length, 1, `Travel cost must appear once: ${entry.id}`);
        for (const link of cost.links) {
          assert(html.includes(link.name.replace(/\s*\(Bound\)/g, "")), `Travel item must remain visible: ${entry.id}`);
          if (link.quantity !== undefined) assert(html.includes(`×${link.quantity.toLocaleString("en")}`), `Travel item quantity must remain visible: ${entry.id}`);
        }
      }
      checked++;
    }
  }
  assert(checked > 0);
  const scarlet = entries["TeleportArtifact:1051067"];
  const unresolved = { ...scarlet, arrival: { ...scarlet.arrival, points: [] } };
  assert.equal(render([scarlet], scarlet.locations[0]), render([unresolved], unresolved.locations[0]), "Waypoint details must not depend on destination navigation");
  const portal = entries["EnvObjData:1100489"];
  assert.match(render([portal], portal.locations[0]), /<button[^>]*>[\s\S]*Eltnen Teleportation Portal/);
  assert.doesNotMatch(render([portal], portal.locations[0]), /View full details|No currency is required to enter\./);
  let routes = 0;
  for (const entry of Object.values(entries).filter((entry) => ["npc", "portal"].includes(entry.travel?.kind))) {
    for (const marker of entry.locations) {
      assert.equal(entry.arrival?.status, "resolved", `Published route must resolve: ${entry.id}`);
      const html = render([entry], marker);
      assert.match(html, /<button[^>]*>[\s\S]*?<svg[\s\S]*?<span>/, `Explicit route must keep destination navigation: ${entry.id}`);
      if (entry.travel.kind === "portal") {
        assert.match(html, />Access and requirements</, `Portal requirements must remain visible: ${entry.id}`);
        assert.doesNotMatch(html, /View full details|No currency is required to enter\./, `Portal marker must omit redundant details: ${entry.id}`);
      } else {
        assert.match(html, /<button[^>]*>Access and requirements<\/button/, `Route requirements must remain accessible: ${entry.id}`);
      }
      routes++;
    }
  }
  assert(routes > 0);
  console.log(`Travel marker rendering verified: ${checked} waypoint locations retain information and portal routes retain destination buttons.`);
} finally {
  await unlink(bundle);
  await rmdir(directory);
}
