"""Publish real interior map images with exact source-coordinate inset markers."""
import argparse
from collections import Counter, defaultdict
import hashlib
import importlib
import json
import math
from pathlib import Path
import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import clean, value, write
from world import MAPS

sources = importlib.import_module('world-marker-sources')
travel = importlib.import_module('travel-network')
internal = importlib.import_module('adventure-identities').INTERNAL_NAME
ATLAS = 'dungeon-atlas'
SLOT = 2560
SIZE = 2048


def read(path):
    return json.loads(Path(path).read_text('utf8'))


def placement(index, bounds, atlas=False):
    """Keep image slots stable across imports and leave room for headings."""
    if atlas:
        return (index % 10 * SLOT, index // 10 * SLOT + 256)
    columns = math.ceil((bounds['maxX'] - bounds['minX']) / SLOT)
    rows = math.ceil((bounds['maxY'] - bounds['minY']) / SLOT)
    ring = 1
    while True:
        cells = ([(x, -ring) for x in range(-ring, columns + ring)]
                 + [(columns + ring - 1, y) for y in range(-ring + 1, rows + ring)]
                 + [(x, rows + ring - 1) for x in range(columns + ring - 2, -ring - 1, -1)]
                 + [(-ring, y) for y in range(rows + ring - 2, -ring, -1)])
        if index < len(cells):
            x, y = cells[index]
            return bounds['minX'] + x * SLOT + 256, bounds['minY'] + y * SLOT + 256
        index -= len(cells)
        ring += 1


def image_grid(key, definition, textures, output):
    """Require a complete source grid. Fog masks and path overlays never qualify."""
    cols, rows = (int(definition['SectorSize'][axis]) for axis in ('X', 'Y'))
    paths = []
    for x in range(cols):
        for y in range(rows):
            matches = textures.get(f'{key}_{x:02}_{y:02}'.casefold(), [])
            if len(matches) != 1:
                return None
            paths.append((x, y, matches[0]))
    target = output / (key.casefold().replace('_', '-') + '.webp')
    source_tiles = [{'path': str(p.relative_to(textures.root)).replace('\\', '/'),
                     'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for _, _, p in paths]
    result = {'image': '../' + ATLAS + '/insets/' + target.name, 'sourceTiles': source_tiles}
    cached = textures.previous.get(key.casefold(), {})
    if target.exists() and cached.get('sourceTiles') == source_tiles and cached.get('imageSha256') == hashlib.sha256(target.read_bytes()).hexdigest():
        with Image.open(target) as existing:
            existing.verify()
        result['imageSha256'] = cached['imageSha256']
        return result
    # Preserve the grid orientation used by the existing world-map tile importer.
    with Image.open(paths[0][2]) as first:
        tile = first.width
        if first.height != tile:
            raise ValueError('Non-square source tile: ' + str(paths[0][2]))
    scale = min(1, 4096 / max(cols * tile, rows * tile))
    cell = round(tile * scale)
    canvas = Image.new('RGBA', (cols * cell, rows * cell))
    for x, y, path in paths:
        with Image.open(path) as image:
            if image.size != (tile, tile):
                raise ValueError('Inconsistent source tile size: ' + str(path))
            canvas.paste(image.convert('RGBA').resize((cell, cell), Image.Resampling.LANCZOS), (x * cell, y * cell))
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, 'WEBP', quality=90, method=6)
    result['imageSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    return result


class TextureIndex(defaultdict):
    def __init__(self, root, previous):
        super().__init__(list)
        self.root = Path(root)
        self.previous = previous
        for path in self.root.rglob('*.png'):
            self[path.stem.casefold()].append(path)


def publish_spawn_markers(map_id, export, metadata, slug, projection, bounds, entities, entries,
                          bosses, dungeon_boss_ids, marker_ids, report, localized, inset_id=None, event_name=None,
                          include_event_spawns=False, world_fallback=None):
    """Project readable native spawns onto their actual image or parent world image."""
    sources = importlib.import_module('world-marker-sources')
    internal = importlib.import_module('adventure-identities').INTERNAL_NAME
    event_layer = event_name is not None
    title = event_name if event_layer else next(
        inset['name'] for inset in metadata['insets'] if inset['id'] == inset_id)
    count = 0
    for spawn in export['data']['Properties']['Data']['SpawnInfoList']:
        for table_name, field in (('NpcData', 'NpcIdList'), ('EnvObjData', 'EnvObjIdList')):
            for cell in spawn[field]:
                entity_id = value(cell)
                entity = entities[table_name].get(entity_id)
                entry = entries.get(f'{table_name}:{entity_id}')
                if not entity:
                    continue
                if entry and not entry.get('unnamed') and not internal.search(entry['name']):
                    name = entry['name']
                    category = sources.classify(table_name, entity, entry, bosses)
                    if table_name == 'NpcData' and entry['id'] in dungeon_boss_ids:
                        category = 'dungeon-boss'
                    # Named event actors without a service or combat function
                    # are still present in the native spawn list.
                    if not category and table_name == 'NpcData' and include_event_spawns:
                        category = 'enemy' if entity['NpcType'].endswith('::Monster') else 'npc'
                else:
                    continue
                if not category or category in sources.TRAVEL_CATEGORIES and not travel.linked_travel(entry, entries):
                    continue
                for transform in spawn['Positions']:
                    position = transform['Location']
                    point = sources.project(position, projection, bounds)
                    world_point = False
                    if not (bounds['minX'] <= point['x'] <= bounds['maxX']
                            and bounds['minY'] <= point['y'] <= bounds['maxY']):
                        if world_fallback:
                            world_projection, world_bounds = world_fallback
                            point = sources.project(position, world_projection, world_bounds)
                            world_point = (world_bounds['minX'] <= point['x'] <= world_bounds['maxX']
                                           and world_bounds['minY'] <= point['y'] <= world_bounds['maxY'])
                        if not world_point:
                            report['unmappedPositions'].append({'mapId': map_id,
                                                                'reference': entry['id'] if entry else f'{table_name}:{entity_id}',
                                                                'actor': spawn['Name'], 'reason': 'outside-image'})
                            continue
                        report.setdefault('worldSpillover', []).append({'mapId': map_id,
                                                                        'reference': entry['id'] if entry else f'{table_name}:{entity_id}',
                                                                        'actor': spawn['Name']})
                    identity = entry['id'] if entry else f'{table_name}:{entity_id}'
                    digest = hashlib.sha256(f'{map_id}/{identity}/{spawn["Name"]}/{position}'.encode()).hexdigest()[:16]
                    prefix = f'event-layer-{map_id}' if event_layer or world_point else inset_id
                    marker = {'id': f'{prefix}-{digest}', 'name': name, 'category': category,
                              **point, 'entityId': str(entity_id), 'sourceActor': spawn['Name'],
                              'sourceAsset': export['asset'], 'worldPosition': position,
                              'elevation': position['Z']}
                    if entry:
                        marker['reference'] = {'id': entry['id'], 'category': entry['category']}
                    if inset_id and not world_point:
                        marker.update({'insetId': inset_id, 'regionId': inset_id, 'region': title})
                    if event_layer or world_point:
                        marker['eventLayerMapId'] = map_id
                        marker['regionId'] = 'event-layer-' + str(map_id)
                        marker['region'] = title
                    if marker['id'] in marker_ids[slug]:
                        continue
                    marker_ids[slug].add(marker['id'])
                    metadata['locations'].append(marker)
                    if entry:
                        entry['locations'].append({'mapId': slug, 'markerId': marker['id'],
                                                   'name': (metadata['displayName'] if world_point else title) + ' · ' + entry['name']})
                    count += 1
    return count


def build(args):
    public, tables = Path(args.public), Path(args.tables)
    reference = public / 'data/reference'
    locale_path = Path(args.locale)
    locale = read(locale_path)
    table = lambda name: read(tables / (name + '.json'))['Properties']['Data']
    manifest = read(reference / 'manifest.json')
    for source in manifest['tables']:
        if source['name'] in ('Map', 'Dungeon', 'EnvObjData', 'NpcData', 'Teleport', 'TeleportArtifact'):
            if hashlib.sha256((tables / (source['name'] + '.json')).read_bytes()).hexdigest() != source['sha256']:
                raise ValueError('Source snapshot mismatch: ' + source['name'])
    strings = {k.casefold(): clean(v) for k, v in read(args.localization)['Entries'].items()}
    def localized(field):
        key = field.get('Key', '').casefold()
        return strings.get(key) or strings.get('string_' + key + '_body', '')
    map_rows = {value(r['ID']): r for r in table('Map')}
    dungeon_rows = {value(r['ID']): r for r in table('Dungeon')}
    entries, chunks = {}, {}
    for category in ('travel', 'exploration', 'creatures', 'dungeons'):
        for path in (reference / category).glob('*.json'):
            chunk = read(path)
            chunks[path] = chunk
            entries.update(chunk['entries'])
    exports = {}
    for path in Path(args.map_data).glob('*.json'):
        export = read(path)
        map_id = export['data']['Properties']['Data']['MapId']
        if map_id in exports:
            raise ValueError('Duplicate map export: ' + str(map_id))
        exports[map_id] = export
    definitions = {}
    for path in Path(args.world_data).glob('*.json'):
        export = read(path)
        data = export['data']['Properties']['Data']
        # A few real map exports leave the table key blank; their exact asset
        # stem still matches both Map.Name and the texture tile prefix.
        image_key = data['WorldMapDataTableKey'] or export['asset'].rsplit('/', 1)[-1].removesuffix('.dat')
        definitions[image_key.casefold()] = (export['asset'], data)
    maps = {slug: read(public / 'maps' / slug / 'metadata.json') for _, slug, *_ in MAPS}
    world_ids = {map_id: slug for map_id, slug, *_ in MAPS}
    atlas_path = public / 'maps' / ATLAS / 'metadata.json'
    maps[ATLAS] = read(atlas_path) if atlas_path.exists() else {
        'id': ATLAS, 'displayName': locale['mapInteriors']['atlas'], 'schemaVersion': 1, 'tileSize': 256, 'detailLevels': [0],
        'bounds': {'minX': 0, 'minY': 0, 'maxX': SLOT * 10, 'maxY': SLOT * 10},
        'regions': [], 'locations': [], 'hideBaseTiles': True,
    }
    old_insets = {slug: {i['id']: i for i in metadata.get('insets', [])} for slug, metadata in maps.items()}
    for metadata in maps.values():
        metadata['locations'] = [p for p in metadata['locations'] if not p.get('insetId') and not p.get('eventLayerMapId')]
        metadata['regions'] = [r for r in metadata.get('regions', [])
                               if not r['id'].startswith(('interior-', 'event-layer-'))]
        metadata['insets'] = []
    for entry in entries.values():
        entry['locations'] = [p for p in entry.get('locations', [])
                              if not p['markerId'].startswith(('interior-', 'event-layer-'))]
    marker_ids = {slug: {p['id'] for p in metadata['locations']} for slug, metadata in maps.items()}
    candidates = defaultdict(list)
    for key, entry in entries.items():
        if entry['category'] == 'dungeons':
            row = dungeon_rows[int(key.split(':')[1])]
            candidates[value(row['MapId'])].append(entry)
        if entry['category'] == 'travel' and entry.get('destination'):
            candidates[entry['destination']['mapId']]
    event_catalog_path = public / 'data/event-entrances.json'
    event_map_ids = set()
    event_destinations = {}
    event_entrances = {}
    if event_catalog_path.exists():
        event_entrances = read(event_catalog_path)['npcs']
        for entrance in event_entrances.values():
            event_map_ids.add(entrance['mapId'])
            if entrance.get('destinationId'):
                previous_destination = event_destinations.setdefault(entrance['mapId'], entrance['destinationId'])
                if previous_destination != entrance['destinationId']:
                    raise ValueError('Conflicting event destinations for map ' + str(entrance['mapId']))
            destinations = candidates[entrance['mapId']]
            destination = entries.get(entrance.get('destinationId'))
            if destination and all(entry['id'] != destination['id'] for entry in destinations):
                destinations.append(destination)
        for slug, metadata in maps.items():
            for point in metadata['locations']:
                entrance = event_entrances.get(point.get('entityId')) if point.get('category') == 'event-entrance' else None
                if entrance:
                    destination = entries.get(entrance.get('destinationId'))
                    if destination and not any(location['mapId'] == slug and location['markerId'] == point['id']
                                               for location in destination['locations']):
                        destination['locations'].append({
                            'mapId': slug, 'markerId': point['id'],
                            'name': metadata['displayName'] + ' · ' + point['name']})
    for map_id, row in map_rows.items():
        if value(row['BaseMapId']) in world_ids:
            candidates[map_id]
    entities = {name: {value(r['ID']): r for r in table(name)} for name in ('NpcData', 'EnvObjData')}
    bosses = {r['FieldNamedName'] for r in table('WorldMapFieldNamed')}
    dungeon_bosses = {map_id: {link['id'] for dungeon in dungeons
                      for section in dungeon['sections']
                      if section['title'] in ('reference.labels.bosses', 'reference.labels.boss')
                      for link in section.get('links', [])}
                      for map_id, dungeons in candidates.items()}
    prior_audit_path = reference / 'interior-map-audit.json'
    previous = {r['imageKey']: r for r in read(prior_audit_path)['included']} if prior_audit_path.exists() else {}
    textures, images = TextureIndex(args.textures, previous), {}
    report = {'version': 1, 'included': [], 'excluded': [], 'unmappedPositions': []}
    names = locale.setdefault('mapInteriors', {}).setdefault('names', {})
    mapped = defaultdict(list)
    for map_id, dungeons in sorted(candidates.items()):
        if map_id in world_ids:
            continue
        row, export = map_rows.get(map_id), exports.get(map_id)
        name = localized(row['Desc']) if row else ''
        if not row or not export or not name or internal.search(name):
            report['excluded'].append({'mapId': map_id, 'reason': 'missing-named-map-or-source'})
            continue
        data = export['data']['Properties']['Data']
        shared = data['BasicInfo']['SharingMap']['AssetPath']['PackageName'].split('/')[-1]
        key = next((k.casefold() for k in (row['Name'], shared) if k.casefold() in definitions), None)
        if not key:
            report['excluded'].append({'mapId': map_id, 'name': name, 'reason': 'no-separate-map-image-definition'})
            continue
        definition_asset, definition = definitions[key]
        if key not in images:
            images[key] = image_grid(key, definition, textures, public / 'maps' / ATLAS / 'insets')
        image = images[key]
        if not image:
            report['excluded'].append({'mapId': map_id, 'name': name, 'reason': 'missing-complete-texture-grid', 'imageKey': key})
            continue
        parents = {world_ids[value(row['BaseMapId'])]} if value(row['BaseMapId']) in world_ids else {
            p['mapId'] for entry in dungeons if entry.get('adventure', {}).get('entranceAssociation') != 'family'
            for p in entry['locations'] if p['mapId'] in maps and p['mapId'] != ATLAS}
        if not parents:
            parents = {ATLAS}
        suffix = []
        if row['MapRace'].split('::')[-1] in ('Light', 'Dark'):
            suffix.append(locale['mapInteriors']['factions'][row['MapRace'].split('::')[-1]])
        difficulty = next((e['adventure']['difficulty'] for e in dungeons if e['adventure'].get('difficulty') not in (None, 'none')), None)
        if difficulty:
            suffix.append(difficulty.capitalize())
        title = name + (' · ' + ' · '.join(suffix) if suffix else '')
        names[str(map_id)] = title
        for slug in sorted(parents):
            metadata = maps[slug]
            inset_id = 'interior-' + str(map_id)
            previous = old_insets[slug].get(inset_id)
            occupied = {i['placementIndex'] for i in metadata['insets']} | {i['placementIndex'] for i in old_insets[slug].values()}
            index = previous['placementIndex'] if previous else next(i for i in range(len(occupied) + 1) if i not in occupied)
            x, y = placement(index, metadata['bounds'], slug == ATLAS)
            size = {axis: definition['SectorSize'][axis] * definition['SectorWorldSize'] for axis in ('X', 'Y')}
            width, height = (SIZE * size[axis] / max(size.values()) for axis in ('X', 'Y'))
            bounds = {'minX': x, 'minY': y, 'maxX': x + width, 'maxY': y + height}
            inset = {'id': inset_id, 'name': title, 'nameKey': 'mapInteriors.names.' + str(map_id),
                     'worldMapId': map_id, 'placementIndex': index, 'image': image['image'], 'bounds': bounds,
                     'worldProjection': {'mapId': map_id, 'origin': definition['StartWorldLocation'], 'size': size, 'source': definition_asset},
                     'sourceMap': export['asset']}
            metadata['insets'].append(inset)
            metadata['regions'].append({'id': inset_id, 'name': title, 'x': x + width / 2, 'y': y + height / 2, 'inset': True})
            mapped[map_id].append((slug, inset))
            publish_spawn_markers(map_id, export, metadata, slug, inset['worldProjection'], bounds,
                                  entities, entries, bosses, dungeon_bosses.get(map_id, set()), marker_ids, report, localized, inset_id=inset_id,
                                  include_event_spawns=map_id in event_map_ids,
                                  world_fallback=(metadata['worldProjection'], metadata['bounds'])
                                  if map_id in event_map_ids and slug != ATLAS else None)
            destination = entries.get(event_destinations.get(map_id))
            if destination:
                marker = {'id': inset_id + '-location', 'name': destination['name'],
                          'category': 'dungeon', 'insetId': inset_id, 'regionId': inset_id,
                          'region': title, 'x': x + width / 2, 'y': y + height / 2,
                          'reference': {'id': destination['id'], 'category': 'dungeons'},
                          'mapAnnotation': True}
                metadata['locations'].append(marker)
                marker_ids[slug].add(marker['id'])
                destination['locations'].append({'mapId': slug, 'markerId': marker['id'],
                                                 'name': title})
            report['included'].append({'mapId': map_id, 'parent': slug, 'name': title, 'imageKey': key,
                                       'sourceMap': export['asset'], 'sourceTiles': image['sourceTiles'], 'imageSha256': image['imageSha256']})
    # A field event instance layer without its own image reuses its base
    # world's image. Publish its native actors on that world image.
    for map_id in sorted(event_map_ids - mapped.keys()):
        row, export = map_rows.get(map_id), exports.get(map_id)
        parent = world_ids.get(value(row['BaseMapId'])) if row else None
        if not parent or not export:
            raise ValueError('Event map has no published image or parent world: ' + str(map_id))
        metadata = maps[parent]
        name = localized(row['Desc'])
        count = publish_spawn_markers(map_id, export, metadata, parent, metadata['worldProjection'],
                                      metadata['bounds'], entities, entries, bosses, dungeon_bosses.get(map_id, set()), marker_ids, report, localized,
                                      event_name=name, include_event_spawns=True)
        points = [point for point in metadata['locations'] if point.get('eventLayerMapId') == map_id]
        if not points:
            raise ValueError('Event layer has no readable native spawns: ' + str(map_id))
        xs, ys = sorted(point['x'] for point in points), sorted(point['y'] for point in points)
        names[str(map_id)] = name
        metadata['regions'].append({'id': 'event-layer-' + str(map_id), 'name': name,
                                    'x': (xs[0] + xs[-1]) / 2, 'y': (ys[0] + ys[-1]) / 2,
                                    'focusBounds': {'minX': xs[0], 'maxX': xs[-1],
                                                    'minY': ys[0], 'maxY': ys[-1]}})
        report.setdefault('worldEventLayers', []).append({'mapId': map_id, 'parent': parent,
                                                           'sourceMap': export['asset'], 'markers': count})
    for map_id in sorted(event_map_ids & mapped.keys()):
        for slug, _ in mapped[map_id]:
            metadata = maps[slug]
            points = [point for point in metadata['locations'] if point.get('eventLayerMapId') == map_id]
            if not points:
                continue
            xs, ys = sorted(point['x'] for point in points), sorted(point['y'] for point in points)
            metadata['regions'].append({'id': 'event-layer-' + str(map_id), 'name': names[str(map_id)],
                                        'x': (xs[0] + xs[-1]) / 2, 'y': (ys[0] + ys[-1]) / 2,
                                        'focusBounds': {'minX': xs[0], 'maxX': xs[-1],
                                                        'minY': ys[0], 'maxY': ys[-1]}})
    for slug, metadata in maps.items():
        rectangles = [i['bounds'] for i in metadata['insets']]
        if slug != ATLAS:
            rectangles.append(metadata['bounds'])
        if not rectangles:
            raise ValueError('No real interior images found for atlas')
        navigation = {key: (min if key.startswith('min') else max)(r[key] for r in rectangles)
                      + (-256 if key.startswith('min') else 256) for key in ('minX', 'minY', 'maxX', 'maxY')}
        metadata['navigationBounds'] = navigation
        if slug == ATLAS:
            metadata['bounds'] = navigation.copy()
        write(public / 'maps' / slug / 'metadata.json', metadata)
    for entry in entries.values():
        if entry['category'] != 'travel' or not entry.get('destination'):
            continue
        destination = entry['destination']
        options = mapped.get(destination['mapId'])
        if not options:
            continue
        slug, inset = options[0]
        data = exports[destination['mapId']]['data']['Properties']['Data']
        positions = {p['Key']: p['Value']['Location'] for p in data['TeleportDataMap']}
        points = []
        for actor in (a.strip() for a in destination.get('actor', '').split(',')):
            if actor not in positions:
                continue
            xy = sources.project(positions[actor], inset['worldProjection'], inset['bounds'])
            if not (inset['bounds']['minX'] <= xy['x'] <= inset['bounds']['maxX'] and inset['bounds']['minY'] <= xy['y'] <= inset['bounds']['maxY']):
                report['unmappedPositions'].append({'mapId': destination['mapId'], 'reference': entry['id'], 'actor': actor, 'reason': 'arrival-outside-image'})
                continue
            points.append({'actor': actor, 'world': positions[actor], 'source': inset['sourceMap'], **xy})
        entry['arrival'] = {'worldMapId': destination['mapId'], 'mapId': slug, 'mapName': inset['name'],
                            'insetId': inset['id'], 'points': points, 'status': 'resolved' if points else 'region-only'}
    index_path = reference / 'index.json'
    index = read(index_path)
    summaries = {summary['id']: summary for summary in index['entries']}
    importlib.import_module('dungeon-interiors').attach(entries, dungeon_rows.values(), maps,
                                                      event_entrances, summaries)
    audit = travel.enrich(entries, maps)
    for path, chunk in chunks.items():
        if read(path) != chunk:
            write(path, chunk)
    for summary in index['entries']:
        if summary['category'] == 'travel':
            summary['travel'] = entries[summary['id']]['travel']
    write(index_path, index)
    write(reference / 'travel-audit.json', audit)
    write(reference / 'interior-map-audit.json', report)
    write(locale_path, locale, indent=2)
    print(json.dumps({'images': sum(bool(v) for v in images.values()), 'insets': len(report['included']),
                      'maps': dict(Counter(r['parent'] for r in report['included'])),
                      'excluded': dict(Counter(r['reason'] for r in report['excluded'])),
                      'outsideImage': len(report['unmappedPositions'])}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('tables', 'localization', 'map-data', 'world-data', 'textures'):
        parser.add_argument('--' + flag, required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('--locale', default='src/i18n/locales/en.json')
    build(parser.parse_args())
