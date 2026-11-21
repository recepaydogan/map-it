"""Compare published markers with decoded world spawns without changing map data."""
import argparse
import hashlib
import importlib
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import value, write
from world import ENV_CATEGORIES, MAPS


def audit(tables, public, map_data, output, map_events):
    public, tables = Path(public), Path(tables)
    rows = lambda name: json.loads((tables / (name + '.json')).read_text('utf8'))['Properties']['Data']
    manifest = json.loads((public / 'data/reference/manifest.json').read_text('utf8'))
    hashes = {source['name']: source['sha256'] for source in manifest['tables']}
    for name in ('NpcData', 'EnvObjData', 'WorldMapFieldNamed'):
        if hashes.get(name) != hashlib.sha256((tables / (name + '.json')).read_bytes()).hexdigest():
            raise ValueError('Source version mismatch: ' + name)
    entities = {table: {value(row['ID']): row for row in rows(table)} for table in ('NpcData', 'EnvObjData')}
    bosses = {row['FieldNamedName'] for row in rows('WorldMapFieldNamed')}
    entries = {}
    for category in ('dungeons', 'creatures', 'exploration', 'quests'):
        for path in (public / 'data/reference' / category).glob('*.json'):
            entries.update(json.loads(path.read_text('utf8'))['entries'])
    internal = importlib.import_module('adventure-identities').INTERNAL_NAME
    exports = {}
    map_ids = {row[0] for row in MAPS}
    for path in Path(map_data).glob('*.json'):
        raw = path.read_bytes()
        export = json.loads(raw)
        data = export['data']['Properties']['Data']
        if data['MapId'] in map_ids and '/InstanceLayer/' not in export['asset']:
            if data['MapId'] in exports:
                raise ValueError(f'Ambiguous map export: {data["MapId"]}')
            exports[data['MapId']] = (export, hashlib.sha256(raw).hexdigest())

    source_rules = importlib.import_module('world-marker-sources')
    event_maps = source_rules.read_event_maps(map_events)

    def classify(table, row, entry):
        return source_rules.classify(table, row, entry, bosses)

    report = {'version': 1, 'maps': [], 'gaps': [], 'dungeons': [], 'limitations': [
        'This measures exact source entity/position coverage, not live availability or all possible server-driven spawns.',
        'Instance layers are excluded; additional conditional and event spawns remain outside this denominator.',
        'Native resources can overlap item-based gatherable layers; unmatched native resources require cross-layer correlation.',
        'External gatherable and collectible snapshots are inventoried, not independently proven complete.',
        'A dungeon without a linked entrance is unresolved, not proof that it requires a separate physical marker.',
        'Marker presence is independent of the user-selected layer visibility; runtime UI tests are not performed.',
        'A position mismatch can be an additional spawn or an existing marker at a different source position; it must not be automatically duplicated.',
        'Instance/event entrances are measured separately from ordinary dungeon entrances.',
    ]}
    visible_locations = set()
    for map_id, slug, *_ in MAPS:
        path = public / 'maps' / slug / 'metadata.json'
        raw = path.read_bytes()
        metadata = json.loads(raw)
        points = list(metadata['locations'])
        by_reference = defaultdict(list)
        for point in points:
            by_reference[point.get('reference', {}).get('id')].append(point)
            if not point.get('hiddenFromMap'):
                visible_locations.add((slug, point['id']))
        result = {'mapId': slug, 'name': metadata['displayName'], 'metadataSha256': hashlib.sha256(raw).hexdigest(),
                  'published': dict(Counter(point['category'] for point in points if not point.get('hiddenFromMap'))),
                  'layers': [], 'coverage': {}, 'unclassified': {}, 'sourceStatus': 'missing'}
        for layer_path in sorted(path.parent.glob('*.json')):
            if layer_path == path:
                continue
            layer = json.loads(layer_path.read_text('utf8'))
            if isinstance(layer, dict) and 'locations' in layer:
                points.extend(layer['locations'])
                result['layers'].append({'file': layer_path.name, 'source': layer.get('source'),
                                        'counts': dict(Counter(point['category'] for point in layer['locations']))})
        by_reference.clear()
        for point in points:
            by_reference[point.get('reference', {}).get('id')].append(point)
            if not point.get('hiddenFromMap'):
                visible_locations.add((slug, point['id']))
        report['maps'].append(result)
        if map_id not in exports or not metadata.get('worldProjection'):
            continue
        export, digest = exports[map_id]
        result.update({'sourceStatus': 'available', 'sourceAsset': export['asset'], 'sourceSha256': digest})
        projection, bounds = metadata['worldProjection'], metadata['bounds']
        counts, unclassified, seen = defaultdict(Counter), Counter(), set()
        for spawn in export['data']['Properties']['Data']['SpawnInfoList']:
            for table, field in (('NpcData', 'NpcIdList'), ('EnvObjData', 'EnvObjIdList')):
                for cell in spawn[field]:
                    row = entities[table].get(value(cell))
                    if not row:
                        unclassified[table + ':missing-table-row'] += 1
                        continue
                    reference = table + ':' + str(value(cell))
                    entry = entries.get(reference, {})
                    if entry.get('unnamed') or internal.search(entry.get('name', '')):
                        unclassified[table + ':internal-or-unnamed'] += 1
                        continue
                    category = classify(table, row, entry)
                    if not category:
                        unclassified[table + ':' + (row.get('Usage') or row.get('FunctionType', 'unknown'))] += 1
                        continue
                    for transform in spawn['Positions']:
                        position = transform['Location']
                        xy = {axis.lower(): bounds['min' + axis] + (position[axis] - projection['origin'][axis])
                              * (bounds['max' + axis] - bounds['min' + axis]) / projection['size'][axis] for axis in ('X', 'Y')}
                        identity = (reference, round(xy['x'], 3), round(xy['y'], 3))
                        if identity in seen:
                            continue
                        seen.add(identity)
                        counts[category]['expected'] += 1
                        matched = [point for point in by_reference[reference] if math.hypot(point['x'] - xy['x'], point['y'] - xy['y']) <= 1]
                        if any(not point.get('hiddenFromMap') for point in matched):
                            counts[category]['present'] += 1
                            if not any(point['category'] == category for point in matched):
                                counts[category]['differentCategory'] += 1
                            continue
                        existing = by_reference[reference]
                        nearest = min(existing, key=lambda point: math.hypot(point['x'] - xy['x'], point['y'] - xy['y'])) if existing else None
                        distance = math.hypot(nearest['x'] - xy['x'], nearest['y'] - xy['y']) if nearest else None
                        status = ('hidden' if matched else 'out-of-bounds' if not
                                  (bounds['minX'] <= xy['x'] <= bounds['maxX'] and bounds['minY'] <= xy['y'] <= bounds['maxY'])
                                  else 'unpublished-reference' if not entry else 'nearby-position' if distance is not None and distance <= 4
                                  else 'additional-or-shifted-position' if nearest else 'missing-marker')
                        counts[category][status] += 1
                        report['gaps'].append({'mapId': slug, 'category': category, 'reference': reference,
                                               'name': entry.get('name', row['Name']), 'status': status,
                                               'nearestMarker': nearest['id'] if nearest else None,
                                               'nearestDistance': round(distance, 3) if distance is not None else None,
                                               'actor': spawn['Name'], 'x': round(xy['x'], 3), 'y': round(xy['y'], 3)})
        quest_sources = importlib.import_module('world-marker-details').quest_points
        for quest, actor, world in quest_sources(SimpleNamespace(entries=entries, rows=rows, map_events=event_maps), map_id, export['data']['Properties']['Data']):
            xy = source_rules.project(world, projection, bounds)
            counts['quest-area']['expected'] += 1
            if any(not point.get('hiddenFromMap') and math.hypot(point['x'] - xy['x'], point['y'] - xy['y']) <= 1 for point in by_reference[quest['id']]):
                counts['quest-area']['present'] += 1
            else:
                counts['quest-area']['missing-marker'] += 1
                report['gaps'].append({'mapId': slug, 'category': 'quest-area', 'reference': quest['id'], 'name': quest['name'], 'actor': actor, 'status': 'missing-marker', **xy})
        result['coverage'] = {key: dict(count) for key, count in sorted(counts.items())}
        result['unclassified'] = dict(unclassified)
    for entry in entries.values():
        if entry['category'] != 'dungeons' or not entry.get('adventure', {}).get('listed'):
            continue
        locations = [location for location in entry['locations'] if (location['mapId'], location['markerId']) in visible_locations]
        report['dungeons'].append({'id': entry['id'], 'name': entry['name'], 'kind': entry['adventure']['kind'],
                                   'status': ('family-guide' if entry['adventure'].get('entranceAssociation') == 'family' else 'linked') if locations else 'unresolved',
                                   'locations': locations})
    report['dungeonCounts'] = dict(Counter(row['status'] for row in report['dungeons']))
    write(Path(output), report)
    print(json.dumps({'dungeons': report['dungeonCounts'], 'maps': [{key: row[key] for key in ('mapId', 'sourceStatus', 'coverage')} for row in report['maps']]}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--public', default='public')
    parser.add_argument('--map-data', required=True)
    parser.add_argument('--map-events', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    audit(args.tables, args.public, args.map_data, args.output, args.map_events)
