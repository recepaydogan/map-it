"""Import travel source and arrival positions from decoded map data."""
import hashlib
import importlib
import json
import math
from pathlib import Path
from context import value, write
from world import MAPS


def read_map_exports(directory):
    result = {}
    for path in sorted(Path(directory).glob('*.json')):
        exported = json.loads(path.read_text('utf8'))
        if '/InstanceLayer/' in exported['asset']:
            continue
        data = exported['data']['Properties']['Data']
        key = data['MapId']
        if key in result:
            raise ValueError(f'Ambiguous map export: {key}')
        result[key] = (exported['asset'], data)
    return result


def project(position, projection, bounds):
    point = {axis.lower(): round(bounds['min' + axis] + (position[axis] - projection['origin'][axis])
             * (bounds['max' + axis] - bounds['min' + axis]) / projection['size'][axis], 3) for axis in ('X', 'Y')}
    if not all(math.isfinite(v) for v in point.values()):
        raise ValueError('Non-finite travel coordinates')
    if not (bounds['minX'] <= point['x'] <= bounds['maxX'] and bounds['minY'] <= point['y'] <= bounds['maxY']):
        raise ValueError(f'Travel point outside map bounds: {point}')
    return point


def import_positions(entries, public, tables, map_data, world_data):
    public = Path(public)
    decoded = read_map_exports(map_data)
    travel = importlib.import_module('travel-network')
    world_exports = {}
    for path in Path(world_data).glob('*.json'):
        exported = json.loads(path.read_text('utf8'))
        data = exported['data']['Properties']['Data']
        world_exports[data['WorldMapDataTableKey'].casefold()] = (exported['asset'], data)
    rows = lambda table: json.loads((Path(tables) / (table + '.json')).read_text('utf8'))['Properties']['Data']
    map_rows = {value(row['ID']): row for row in rows('Map')}
    rifts = {str(value(row['ID'])): row for row in rows('RiftData')}
    maps = {}
    added = 0
    for map_id, slug, internal, *_ in MAPS:
        path = public / 'maps' / slug / 'metadata.json'
        metadata = json.loads(path.read_text('utf8'))
        asset, world = world_exports[internal.casefold()]
        projection = {'mapId': map_id, 'origin': world['StartWorldLocation'],
                      'size': {axis: world['SectorSize'][axis] * world['SectorWorldSize'] for axis in ('X', 'Y')}, 'source': asset}
        metadata['worldProjection'] = projection
        maps[map_id] = (slug, metadata)
        map_asset, data = decoded[map_id]
        for spawn in data['SpawnInfoList']:
            sources = [('EnvObjData', cell) for cell in spawn['EnvObjIdList']] + [('NpcData', cell) for cell in spawn['NpcIdList']]
            for table, cell in sources:
                source = entries.get(table + ':' + str(value(cell)))
                if not source:
                    continue
                targets = travel.linked_travel(source, entries)
                if not targets:
                    continue
                category = 'portal' if source.get('route', {}).get('kind') == 'portal' else 'rift' if any(e['id'].startswith('RiftData:') for e in targets) else 'teleport'
                for transform in spawn['Positions']:
                    position = transform['Location']
                    point = project(position, projection, metadata['bounds'])
                    existing = next((p for p in metadata['locations'] if p.get('reference', {}).get('id') == source['id']
                                     and math.hypot(p['x'] - point['x'], p['y'] - point['y']) <= 1), None)
                    digest = hashlib.sha256(f'{map_id}/{source["id"]}/{position["X"]}/{position["Y"]}/{position["Z"]}'.encode()).hexdigest()[:16]
                    marker = existing or {'id': f'{slug}-{category}-{digest}', 'name': source['name'], 'category': category, **point,
                              'reference': {'id': source['id'], 'category': source['category']},
                              'entityId': str(value(cell)), 'elevation': position['Z'],
                              'sourceActor': spawn['Name'], 'sourceAsset': map_asset}
                    if not existing:
                        metadata['locations'].append(marker)
                        added += 1
                    location = {'mapId': slug, 'markerId': marker['id'], 'name': metadata['displayName'] + ' · ' + marker['name']}
                    if location not in source['locations']:
                        source['locations'].append(location)
        write(path, metadata)
    # Published inset images retain their own verified projection and map ID.
    # A later travel refresh must not downgrade these destinations to unavailable.
    for path in sorted((public / 'maps').glob('*/metadata.json')):
        metadata = json.loads(path.read_text('utf8'))
        for inset in metadata.get('insets', []):
            maps.setdefault(inset['worldMapId'], (path.parent.name, {
                'displayName': inset['name'], 'bounds': inset['bounds'],
                'worldProjection': inset['worldProjection'], 'insetId': inset['id'],
            }))
    resolved = 0
    for entry in entries.values():
        if entry['category'] != 'travel':
            continue
        destination = entry.get('destination')
        if entry['id'].startswith('RiftData:'):
            row = rifts[entry['id'].split(':')[1]]
            destination = {'mapId': value(row['ArrivalMapId'])}
            entry['destination'] = destination
        if not destination:
            continue
        map_id = destination['mapId']
        points = []
        export = decoded.get(map_id)
        actors = [a.strip() for a in destination.get('actor', '').split(',') if a.strip()]
        if export:
            asset, data = export
            positions = {r['Key']: r['Value']['Location'] for r in data['TeleportDataMap']}
            for actor in actors:
                if actor in positions:
                    points.append({'actor': actor, 'world': positions[actor], 'source': asset})
        arrival = {'worldMapId': map_id, 'points': points}
        if map_id in maps:
            slug, metadata = maps[map_id]
            arrival.update({'mapId': slug, 'mapName': metadata['displayName']})
            if metadata.get('insetId'):
                arrival['insetId'] = metadata['insetId']
            for point in points:
                point.update(project(point['world'], metadata['worldProjection'], metadata['bounds']))
            arrival['status'] = 'resolved' if points else 'region-only'
        else:
            arrival['status'] = 'map-unavailable'
            arrival['mapName'] = map_rows.get(map_id, {}).get('Name', '')
        entry['arrival'] = arrival
        resolved += bool(points)
    return {'addedMarkers': added, 'entriesWithArrivalCoordinates': resolved}
