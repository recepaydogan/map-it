import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';

const run = promisify(execFile);
const TILE = 64;
const DPR = 2;
const COLUMNS = 24;
const IMAGE_MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

async function findBrowser() {
  const locations = [process.env.WFM_CHROMIUM,
    ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).flatMap(dir => [
      path.join(dir, 'Google/Chrome/Application/chrome.exe'), path.join(dir, 'Microsoft/Edge/Application/msedge.exe'),
    ]), '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const location of locations.filter(Boolean)) {
    try { await access(location); return location; } catch { /* Try the next browser. */ }
  }
  throw new Error('Marker artwork export needs Chromium. Set WFM_CHROMIUM to the browser executable.');
}

export function createMarkerArtwork(root, output, config, writeTga) {
  const images = new Map();
  const entries = new Map();
  const missingIcons = new Set();
  const fallback = (appearance, size) => renderToStaticMarkup(createElement(appearance.icon, { size, strokeWidth: 2.4 }));
  const classes = appearance => `${appearance.markerClass}${appearance.itemArt ? ' map-item-art' : ''}`;
  function register(appearance, category, quest, variant) {
    const spriteKey = config.getMarkerSpriteKey(appearance);
    let dimensions;
    if (variant === 'canvas') dimensions = [config.MARKER_SPRITE_SIZE * (quest || category === 'point-of-interest' ? 0.75 : 1)];
    else if (variant === 'detail') dimensions = [56, appearance.itemArt ? 48 : 28];
    else if (variant === 'filter') dimensions = [20, appearance.itemArt ? 16 : 11];
    else dimensions = [config.MAP_MARKER_SIZES[quest ? 'quest' : variant],
      config.getMapMarkerIconSize(category, quest, appearance.itemArt, variant, true)];
    const key = JSON.stringify([spriteKey, variant, dimensions]);
    let entry = entries.get(key);
    if (!entry) {
      const id = createHash('sha256').update(key).digest('hex').slice(0, 20);
      entry = { id, appearance, dimensions, variant, sprite: `icons\\desktop-${id}.tga` };
      entries.set(key, entry);
    }
    return entry.sprite;
  }
  async function imageData(source) {
    if (!source) return '';
    if (!images.has(source)) {
      images.set(source, (async () => {
        const relative = source.replace(/^\//, '');
        try {
          const buffer = await readFile(path.join(root, 'public', relative));
          return `data:${IMAGE_MIME[path.extname(relative)] ?? 'image/png'};base64,${buffer.toString('base64')}`;
        } catch {
          missingIcons.add(relative);
          return '';
        }
      })());
    }
    return images.get(source);
  }
  async function write() {
    const browser = await findBrowser();
    const work = path.join(output, '..', 'marker-render');
    await mkdir(work, { recursive: true });
    const css = (await readFile(path.join(root, 'src/index.css'), 'utf8'))
      .replace(/^@import[^;]+;/gm, '').replace('@theme {', ':root {');
    const tiles = [...entries.values()];
    const definitions = [], templates = new Map();
    const cells = await Promise.all(tiles.map(async ({ id, appearance, dimensions, variant }) => {
      const source = await imageData(appearance.nativeIconPath);
      const [size, iconSize] = dimensions;
      if (variant === 'canvas') {
        const templateKey = config.getMarkerTemplateKey(appearance);
        if (!templates.has(templateKey)) templates.set(templateKey,
          `<span class="map-marker ${classes(appearance)}" data-marker-template="${templateKey}">${fallback(appearance, appearance.itemArt ? 22 : 18)}<img class="map-native-icon" alt=""></span>`);
        definitions.push({ key: id, templateKey, appearance: { markerClass: appearance.markerClass, itemArt: appearance.itemArt, ...(source ? { nativeIconPath: source } : {}) } });
        return `<div class="sprite-tile" id="sprite-${id}" style="--sprite-size:${size}px"></div>`;
      }
      const repeatable = appearance.nativeIconPath?.includes('mapgenie-repeatable-quest.svg');
      const art = source ? `<img class="map-native-icon${repeatable ? ' map-repeatable-quest-icon' : ''}" width="${iconSize}" height="${iconSize}" src="${source}" alt="">` : fallback(appearance, iconSize);
      if (variant === 'detail') return `<div class="sprite-tile"><span class="map-details-icon">${art}</span></div>`;
      if (variant === 'filter') return `<div class="sprite-tile"><span class="map-filter-category-icon ${classes(appearance)}" style="display:grid;place-items:center;border-radius:50%;width:${size}px;height:${size}px">${art}</span></div>`;
      const base = variant === 'cluster' ? 'map-marker-cluster' : 'map-marker';
      const selected = variant === 'selected' ? ' map-marker-selected' : '';
      return `<div class="sprite-tile"><button class="${base} ${classes(appearance)}${selected}" style="width:${size}px;height:${size}px">${art}</button></div>`;
    }));
    const script = await build({ stdin: { contents: `
      import { createMarkerSprites } from './src/features/map/map-marker-sprites';
      const definitions = JSON.parse(document.getElementById('definitions').textContent);
      const registry = createMarkerSprites(document.getElementById('templates'), definitions, ${DPR}, () => {
        for (const [id, canvas] of registry.sprites) {
          const tile = document.getElementById('sprite-' + id);
          if (!canvas.parentNode) tile.appendChild(canvas);
        }
      });`, resolveDir: root }, bundle: true, write: false, platform: 'browser' });
    const html = path.join(work, 'markers.html');
    const sheet = path.join(work, 'markers.png');
    await writeFile(html, `<!doctype html><meta charset="utf-8"><style>
      *,*::before,*::after{box-sizing:border-box;border-style:solid;border-width:0}button{font:inherit}img{display:block}
      ${css}
      html,body{margin:0;background:transparent!important;overflow:hidden}
      :root{--gold-rgb:222,216,202}
      .map-marker-collect-monoliths:not(.map-marker-mapgenie,.map-marker-icon-only){background-color:#252320}
      .sprite-sheet{display:grid;grid-template-columns:repeat(${COLUMNS},${TILE}px)}
      .sprite-tile{width:${TILE}px;height:${TILE}px;display:grid;place-items:center}
      .sprite-tile canvas{width:var(--sprite-size);height:var(--sprite-size)}
      #templates{position:absolute;visibility:hidden;width:0;height:0;overflow:hidden}
      </style><div class="sprite-sheet">${cells.join('')}</div>
      <div id="templates">${[...templates.values()].join('')}</div>
      <script id="definitions" type="application/json">${JSON.stringify(definitions).replaceAll('<', '\\u003c')}</script>
      <script>${script.outputFiles[0].text}</script>`);
    const width = COLUMNS * TILE;
    const height = Math.ceil(tiles.length / COLUMNS) * TILE;
    await rm(sheet, { force: true });
    await run(browser, ['--headless', '--hide-scrollbars', '--no-first-run', '--disable-background-networking',
      '--default-background-color=00000000', `--force-device-scale-factor=${DPR}`, `--window-size=${width},${height}`,
      '--virtual-time-budget=3000', `--user-data-dir=${path.join(work, 'profile')}`, `--screenshot=${sheet}`, pathToFileURL(html).href],
    { windowsHide: true, timeout: 45_000 });
    const { data, info } = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width * DPR || info.height !== height * DPR) throw new Error('Unexpected marker sprite sheet dimensions.');
    const size = TILE * DPR;
    for (const [index, { sprite }] of tiles.entries()) {
      const left = (index % COLUMNS) * size;
      const top = Math.floor(index / COLUMNS) * size;
      const pixels = Buffer.alloc(size * size * 4);
      let hasArtwork = false;
      for (let y = 0; y < size; y++) {
        const start = ((top + y) * info.width + left) * 4;
        data.copy(pixels, y * size * 4, start, start + size * 4);
      }
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) { hasArtwork = true; break; }
      if (!hasArtwork) throw new Error(`Desktop marker rendered blank: ${sprite}`);
      await writeTga(sharp(pixels, { raw: { width: size, height: size, channels: 4 } }), path.join(output, sprite.replaceAll('\\', '/')));
    }
    return { sprites: tiles.map(({ sprite }) => sprite), missingIcons: [...missingIcons], tileSize: TILE };
  }
  return { register, write };
}
