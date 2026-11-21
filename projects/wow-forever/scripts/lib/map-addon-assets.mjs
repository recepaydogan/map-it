import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as icons from 'lucide-react';
import sharp from 'sharp';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createMarkerArtwork } from './map-addon-artwork.mjs';
import { createAddonDetails } from './map-addon-details.mjs';

export async function writeTga(pipeline, destination) {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const header = Buffer.alloc(18);
  header[2] = 2; header.writeUInt16LE(info.width, 12); header.writeUInt16LE(info.height, 14);
  header[16] = 32; header[17] = 8;
  const pixels = Buffer.alloc(data.length);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const from = (y * info.width + x) * 4, to = ((info.height - 1 - y) * info.width + x) * 4;
    pixels[to] = data[from + 2]; pixels[to + 1] = data[from + 1]; pixels[to + 2] = data[from]; pixels[to + 3] = data[from + 3];
  }
  await writeFile(destination, Buffer.concat([header, pixels]));
  return header.length + pixels.length;
}

export async function loadMapConfig(root, output) {
  const modulePath = path.join(output, '..', 'map-config-runtime.mjs');
  await build({ stdin: { contents: `
    export * from './src/features/map/map-config';
    export { MAP_DEFINITIONS, REMOVED_MAP_CATEGORY_IDS } from './src/features/map/map-registry';
    export * from './src/features/map/map-quest-filter';
    export * from './src/features/map/map-trainer-filters';
    export * from './src/features/map/map-marker-zoom';
    export * from './src/features/map/map-marker-sprites';
    export * from './src/features/map/map-clustering';
    export * from './src/features/map/map-gathering-density';
    export { isZoomLimitedGatheringPoint } from './src/features/map/map-gathering-zoom-filter';
    export { DEFAULT_MARKER_SIZES, getMapPointMarkerScale } from './src/features/map/marker-size-settings';
    export { isQuestPoint } from './src/features/map/map-faction-filter';`,
    resolveDir: root, loader: 'ts' }, bundle: true, packages: 'external', platform: 'node', format: 'esm',
    define: { 'import.meta.env': JSON.stringify({ VITE_CONTENT_BASE_URL: '', BASE_URL: '/' }) }, outfile: modulePath });
  return import(pathToFileURL(modulePath).href + '?t=' + Date.now());
}

export async function exportMarkers(root, output, config, en) {
  const lookup = key => key?.split('.').reduce((v, p) => v?.[p], en);
  const definition = config.MAP_DEFINITIONS.find(d => d.id === 'azeroth');
  const questCatalog = JSON.parse(await readFile(path.join(root, 'public/data/quests/quest-details.json'), 'utf8')).quests;
  const all = (await Promise.all(definition.locationFiles.map(async file =>
    JSON.parse(await readFile(path.join(root, 'public/maps/world-atlas', file), 'utf8')).locations))).flat();
  const detailExport = await createAddonDetails(root,en,all);
  const aliases = new Set(all.flatMap(p => p.aliasIds ?? [])), seen = new Set();
  const filterRows = config.FILTER_CATEGORY_ROWS.flatMap(({category, ids}) => {
    if (config.TRAINER_CATEGORIES.includes(category.id)) return config.TRAINER_FILTER_IDS[category.id].map(type => ({
      id: config.trainerFilterKey(category.id,type), ids: [config.trainerFilterKey(category.id,type)],
      category, label: lookup(`map.trainerFilters.${category.id}.${type}`), legacyIds: [category.id],
      iconPath: (category.id === 'class-trainer' && type !== 'other') || type === 'weapon-master'
        ? `/maps/client-icons/class-trainers/${type}.svg` : category.nativeIconPath,
    }));
    return [{id:category.id, ids, category, label:lookup(category.filterLabelKey ?? category.labelKey), legacyIds:ids}];
  });
  const rowForId = new Map(filterRows.flatMap(row => row.ids.map(id => [id,row.id])));
  const markers = [];
  const directory = path.join(output, 'icons');
  await mkdir(directory, { recursive: true });
  const artwork = createMarkerArtwork(root, output, config, writeTga);
  const spriteVariants = {};
  for (const p of all) {
    if (seen.has(p.id) || aliases.has(p.id) || p.hiddenFromMap || config.REMOVED_MAP_CATEGORY_IDS.has(p.category)
      || config.isLinkedQuestOfferPoint(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    // use-map-data resolves these keys before desktop trainer classification.
    const trainerKey = config.getTrainerFilterKey({...p,
      label:lookup(p.labelKey) ?? p.label ?? '',
      trainerClass:lookup(p.trainerClassKey) ?? p.trainerClass,
      trainerTitle:lookup(p.trainerTitleKey) ?? p.trainerTitle,
    });
    const filterIds = [...new Set((trainerKey ? [trainerKey] : config.getPointFilterCategories(p))
      .map(id => rowForId.get(id)).filter(Boolean))];
    if (!filterIds.length) continue;
    seen.add(p.id);
    const category = config.getCategoryConfig(p.category);
    const appearance = config.getPointAppearance(p);
    const isQuest = config.isQuestPoint(p);
    const sprite = artwork.register(appearance, p.category, isQuest, 'normal');
    spriteVariants[sprite] ??= Object.fromEntries(['selected', 'cluster', 'canvas', 'detail'].map(variant =>
      [variant, artwork.register(appearance, p.category, isQuest, variant)]));
    const quest = p.questId ? questCatalog[String(p.questId)] : undefined;
    const details = {};
    for (const [field, value] of Object.entries({
      faction: p.questInfo?.faction ?? p.trainerFaction ?? quest?.faction,
      level: p.questLevel ?? quest?.level,
      requiredLevel: p.questInfo?.requiredLevel ?? quest?.minimumLevel,
      questGiver: p.questGiverName,
      objective: quest?.objective,
      description: lookup(p.descriptionKey) || p.description || quest?.description,
    })) {
      if ((typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isFinite(value) && value > 0)) details[field] = value;
    }
    const coordinates = p.referenceCoordinates;
    if (coordinates && [coordinates.x, coordinates.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) {
      details.coordinates = { x: coordinates.x, y: coordinates.y };
    }
    markers.push({ id: p.id, x: p.x, y: p.y, name: lookup(p.nameKey) || p.name || lookup(category.labelKey) || p.category,
      filterIds, countKey: p.bookId || p.id, category: p.category, categoryLabel: lookup(category.labelKey) ?? p.category, group: category.groupId,
      region: lookup(p.regionKey) || p.region || '', sprite, details, detailSections: detailExport.forMarker(p),
      faction: p.questInfo?.faction ?? p.trainerFaction ?? 'Neutral',
      priority: config.getMapMarkerPriority(p.category), quest: isQuest,
      clusterCategory: config.getClusterCategoryKey(p), resource: config.isResourceMarkerCategory(p.category),
      limitedGathering: config.isZoomLimitedGatheringPoint(p), markerScale: config.getMapPointMarkerScale(p, config.DEFAULT_MARKER_SIZES),
      sourceOrder: markers.length + 1,
    });
  }
  markers.sort((a, b) => a.id.localeCompare(b.id));
  markers.forEach((marker, index) => { marker.idOrder = index + 1; });
  markers.sort((a, b) => a.sourceOrder - b.sourceOrder);
  detailExport.finalize(markers);
  const categories=[];
  for (const row of filterRows) {
    const members=markers.filter(marker => marker.filterIds.includes(row.id));
    if (!members.length) continue;
    const c=row.category;
    const appearance=config.getPointAppearance({category:c.id});
    if (row.iconPath) appearance.nativeIconPath=row.iconPath;
    categories.push({id:row.id, label:row.label ?? row.id, group:c.groupId,
      enabled:config.DEFAULT_CATEGORY_IDS.includes(c.id), legacyIds:row.legacyIds,
      count:new Set(members.map(marker=>marker.countKey)).size, sprite:artwork.register(appearance, c.id, config.isQuestPoint({category:c.id}), 'filter')});
  }
  const groups=config.FILTER_CATEGORY_GROUPS.filter(g=>categories.some(c=>c.group===g.id))
    .map(g=>({id:g.id,label:lookup(g.labelKey) ?? g.id,defaultExpanded:g.defaultExpanded}));
  const controls = {};
  for (const [key, name] of Object.entries({ check: 'Check', chevron: 'ChevronDown', chevronRight: 'ChevronRight', eye: 'Eye', eyeOff: 'EyeOff', search: 'Search', close: 'X', resize: 'MoveDiagonal2', plus: 'Plus', minus: 'Minus', center: 'LocateFixed', follow: 'Navigation', filters: 'SlidersHorizontal', overview: 'Globe', arrow: 'Navigation2', mapPin: 'MapPin', collapse: 'PanelLeftClose', back: 'ArrowLeft' })) {
    const svg = renderToStaticMarkup(createElement(icons[name], { size: 32, color: '#f1eee5', strokeWidth: 2, fill: key === 'arrow' ? '#f1eee5' : 'none' }));
    controls[key] = `icons\\control-${key}.tga`;
    await writeTga(sharp(Buffer.from(svg)), path.join(directory, `control-${key}.tga`));
  }
  const player = '<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="29" fill="none" stroke="#dbe8ed" stroke-opacity="0.5"/><circle cx="32" cy="32" r="20" fill="#202830" stroke="#f1eee5" stroke-width="3"/></svg>';
  await writeTga(sharp(Buffer.from(player)), path.join(directory, 'player-ring.tga'));
  controls.player = 'icons\\player-ring.tga';
  const css = await readFile(path.join(root, 'src/index.css'), 'utf8');
  const sidebar = css.match(/\.map-details-panel,\s*\.map-filter-panel\s*\{([^}]+)\}/)?.[1];
  const desktopSurface = sidebar?.match(/\bbackground:\s*(rgba\([\d.,\s]+\));/)?.[1];
  const desktopBorder = sidebar?.match(/\bborder-color:\s*(#[\da-f]{6});/i)?.[1];
  const desktopHeader = css.match(/\.map-details-header\s*\{[^}]*\bbackground:\s*(#[\da-f]{6});/i)?.[1];
  if (!desktopSurface || !desktopBorder || !desktopHeader) throw new Error('The desktop sidebar palette could not be exported.');
  const shell = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect x=".5" y=".5" width="63" height="63" rx="16" fill="${desktopSurface}" stroke="${desktopBorder}"/></svg>`;
  controls.sidebar = 'icons\\desktop-sidebar.tga';
  await writeTga(sharp(Buffer.from(shell)), path.join(directory, 'desktop-sidebar.tga'));
  const header = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><path d="M.5 65V16.5A16 16 0 0 1 16.5 .5H47.5A16 16 0 0 1 63.5 16.5V65Z" fill="${desktopHeader}" stroke="${desktopBorder}"/></svg>`;
  controls.detailsHeader = 'icons\\desktop-details-header.tga';
  await writeTga(sharp(Buffer.from(header)), path.join(directory, 'desktop-details-header.tga'));
  const { sprites, missingIcons, tileSize } = await artwork.write();
  const markerRules = {
    sizes: config.MAP_MARKER_SIZES, canvasSize: config.MARKER_SPRITE_SIZE, spriteSize: tileSize,
    regionalZoom: config.MARKER_REGIONAL_ZOOM, minimumScale: config.MARKER_MIN_ZOOM_SCALE,
    clusterZoom: config.MARKER_CLUSTER_ZOOM, clusterProximity: config.getClusterProximity(0),
    clusterOverlap: config.CLUSTER_OVERLAP_DISTANCE, canvasThreshold: config.CANVAS_MARKER_THRESHOLD,
    clusterSteps: config.CLUSTER_ZOOM_STEPS.map(zoom => ({zoom, proximity: config.getClusterProximity(zoom)})),
    clusterZoomMargin: config.CLUSTER_ZOOM_MARGIN,
    gatheringFullZoom: config.FULL_GATHERING_ZOOM, gatheringSpacing: config.GATHERING_TARGET_SPACING_PX,
  };
  return { categories, groups, markers, controls, markerRules, spriteVariants,
    documents: detailExport.documents, detailCoverage: detailExport.report(), sprites, missingIcons };
}
