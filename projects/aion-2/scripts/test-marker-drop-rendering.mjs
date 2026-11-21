import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, unlink, writeFile, rmdir } from "node:fs/promises";
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
      import MapMarkerItems from './src/features/database/map-marker-items';
      import { setFixture } from 'marker-test-state';
      import en from './src/i18n/locales/en.json';
      const i18n = createInstance();
      i18n.init({ lng: 'en', resources: { en: { translation: en } }, initImmediate: false });
      export const render = (fixture) => {
        setFixture(fixture);
        return renderToStaticMarkup(createElement(I18nextProvider, { i18n },
          createElement(MapMarkerItems, {
            mapId: 'test', markerId: 'test', category: 'enemy',
            reference: { category: 'creatures', id: 'test-creature' },
            hasReferenceDetails: true, onOpenItem: () => {}, ...fixture.props,
          })));
      };`,
    resolveDir: process.cwd(), loader: "tsx",
  },
  plugins: [{
    name: "marker-fixtures",
    setup(builder) {
      builder.onResolve({ filter: /marker-test-state|use-marker-items|use-reference-data|game-text/ }, (args) => {
        if (args.path === "marker-test-state" || args.path.endsWith("/game-text")
          || /[/\\]map-marker-items\.tsx$/.test(args.importer)) {
          return { path: "state", namespace: "marker-fixtures" };
        }
      });
      builder.onLoad({ filter: /.*/, namespace: "marker-fixtures" }, () => ({ contents: `
        let fixture;
        export const setFixture = (value) => { fixture = value; };
        export const useMarkerItems = () => ({ status: 'ready', items: fixture.items ?? [], rewards: fixture.groups ?? [] });
        export const useReferenceIndex = () => ({ status: 'ready', data: { entries: [{ id: 'test-creature', category: 'creatures', worldBoss: fixture.worldBoss }] } });
        export const useReferenceEntry = () => ({ status: 'ready', data: { sections: fixture.sections ?? [] } });
        export const useGameText = () => (name) => name;
      ` }));
    },
  }],
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
  define: { "import.meta.env": JSON.stringify({ BASE_URL: "/", DEV: true }) },
});

const directory = await mkdtemp(join(tmpdir(), "marker-drop-test-"));
const bundle = join(directory, "render.cjs");
try {
  await writeFile(bundle, output.outputFiles[0].contents);
  const { render } = createRequire(import.meta.url)(bundle);
  const item = (id, name = id) => ({ id, name, category: "items", grade: "Rare", sourceScope: "specific" });
  const group = (kind) => ({ kind, items: [{ ...item(`${kind}-drop`), probability: 25000000 }], packages: [] });
  const groups = ["participation", "main", "shared", "additional"].map(group);
  const section = (links) => ({ title: "reference.labels.possible-drops", links });

  const ordinary = render({ groups });
  for (const { items } of groups) assert(ordinary.includes(items[0].name), "Normal enemies must show every reward group");
  assert.match(render({ groups: [group("shared"), group("additional")] }), /shared-drop/);

  for (const fixture of [{ props: { category: "boss" } }, { worldBoss: [{ region: "Test region" }] }]) {
    const boss = render({ ...fixture, groups, sections: [section(groups.flatMap(({ items }) => items))] });
    assert.match(boss, /main-drop/);
    assert.match(boss, /participation-drop/);
    assert.doesNotMatch(boss, /shared-drop|additional-drop/, "Hidden world-boss rewards must not return as supplemental drops");
  }

  const preview = item("preview", "Preview material (Bound)");
  const rated = { ...item("rated", "Rated material"), rewardRates: [{ kind: "direct", percent: 25, quantityMin: 1, quantityMax: 1 }] };
  const fallback = render({ items: [preview], sections: [section([preview, rated, item("unbound", "Preview material"), item("soul")])], props: { excludedDropIds: ["soul"] } });
  assert.match(fallback, />Preview material \(Bound\)</);
  assert.match(fallback, />Preview material</);
  assert.match(fallback, />Rated material</);
  assert.match(fallback, /25%/);
  assert.doesNotMatch(fallback, />soul</);
  assert.equal((fallback.match(/>Preview material \(Bound\)</g) ?? []).length, 1);
  assert.match(render({ groups: [group("main")], sections: [section([preview])] }), />Preview material \(Bound\)</);
  assert.equal(render({}), "", "Empty enemies must not gain invented drops");

  const cube = { title: "reference.labels.dungeon-rewards", markerIds: ["test"],
    summaryNotice: "reference.dungeon.bossCubeNotice",
    facts: [{ label: "reference.labels.reward-ticket-cost", value: 40 }],
    links: [item("cube-item", "Dungeon reward (Bound)")] };
  const dungeonBoss = render({ props: { category: "dungeon-boss" }, sections: [cube] });
  assert.match(dungeonBoss, /Dungeon rewards/);
  assert.match(dungeonBoss, /Dungeon reward \(Bound\)/);
  assert.match(dungeonBoss, /Tickets to open reward cube: 40/);
  assert.doesNotMatch(render({ props: { category: "dungeon-boss" },
    sections: [{ ...cube, markerIds: ["another-marker"] }] }), /Dungeon reward \(Bound\)/);

  const manyDrops = Array.from({ length: 31 }, (_, index) => item(`search-drop-${index}`));
  assert.match(render({ sections: [section(manyDrops)] }), /aria-label="Search drops"/, "Large drop lists need a search control");
  assert.doesNotMatch(render({ sections: [section(manyDrops.slice(0, 30))] }), /aria-label="Search drops"/, "Search appears only above 30 drops");

  const metadata = JSON.parse(await readFile("public/maps/world-l-a/metadata.json", "utf8"));
  const chunk = JSON.parse(await readFile("public/data/items/acquisition/marker-items/world-l-a.json", "utf8"));
  const sharedOnly = metadata.locations.find((point) => point.category === "enemy"
    && chunk.rewards?.[point.id]?.length && chunk.rewards[point.id].every(({ kind }) => ["shared", "additional"].includes(kind)));
  assert(sharedOnly, "Published data must cover the shared/additional-only regression");
  const publishedGroups = chunk.rewards[sharedOnly.id];
  const published = render({ groups: publishedGroups, items: chunk.markers[sharedOnly.id] ?? [] });
  assert.match(published, /Other equipment/);
  assert.match(published, /Additional rewards/);
  console.log(`Marker drop rendering verified: normal enemies, world-boss exclusions, preview drops, rates, souls, Bound variants and ${sharedOnly.name}.`);
} finally {
  await unlink(bundle);
  await rmdir(directory);
}
