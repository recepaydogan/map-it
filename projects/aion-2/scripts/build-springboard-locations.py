"""Publish springboard positions only where a shipped map has an exact source projection."""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def project(position, projection, bounds):
    return {axis.lower(): round(bounds[f'min{axis}'] +
            (position[axis] - projection['origin'][axis]) *
            (bounds[f'max{axis}'] - bounds[f'min{axis}']) / projection['size'][axis], 3)
            for axis in ('X', 'Y')}


def publish(exports, tables, public):
    map_root = public / 'maps'
    configs = {row['ID']['Value']: row for row in json.loads((tables / 'SpringboardData.json').read_text(encoding='utf-8'))['Properties']['Data']}
    targets = defaultdict(list)
    for metadata_file in map_root.glob('*/metadata.json'):
        metadata = json.loads(metadata_file.read_text(encoding='utf-8'))
        if 'worldProjection' in metadata:
            targets[metadata['worldProjection']['mapId']].append((metadata_file.parent, metadata['worldProjection'], metadata['bounds'], None, None))
        for inset in metadata.get('insets', []):
            if inset.get('sourceMap') and inset.get('worldProjection'):
                targets[inset['sourceMap']].append((metadata_file.parent, inset['worldProjection'], inset['bounds'], inset['id'], inset['nameKey']))

    locations = defaultdict(list)
    for source_file in exports.glob('*.json'):
        source = json.loads(source_file.read_text(encoding='utf-8'))
        data = source.get('data', {}).get('Properties', {}).get('Data', {})
        springboards = data.get('SpringboardDataMap', [])
        if not springboards:
            continue
        destinations = targets.get(source['asset'], [])
        if not destinations and '/Map/World/' in source['asset'] and '/InstanceLayer/' not in source['asset']:
            map_id = data.get('WorldMapId') or data.get('MapId')
            destinations = targets.get(map_id, [])
        for directory, projection, bounds, inset_id, inset_name_key in destinations:
            for record in springboards:
                value = record['Value']
                config = configs.get(value['DataId'])
                if not config:
                    raise ValueError(f"Springboard data {value['DataId']} is missing for {source['asset']}")
                point = project(value['Location'], projection, bounds)
                if not (bounds['minX'] <= point['x'] <= bounds['maxX'] and bounds['minY'] <= point['y'] <= bounds['maxY']):
                    continue
                identity = f"{source['asset']}:{value['InstanceId']}"
                location = {
                    'id': f"springboard-{hashlib.sha1(identity.encode()).hexdigest()[:16]}",
                    'name': '',
                    'nameKey': 'map.categories.springboard',
                    'category': 'springboard',
                    'entityId': str(value['DataId']),
                    'springboard': {
                        'launch': config['SuperJumpHeight'] > 0,
                        'glideLift': config['GlideUpProbability'] > 0,
                    },
                    **point,
                }
                if inset_id:
                    location.update(regionId=inset_id, regionKey=inset_name_key)
                locations[directory].append(location)

    for stale in map_root.glob('*/springboards.json'):
        if stale.parent not in locations:
            stale.unlink()
    for directory, points in locations.items():
        distinct = {point['id']: point for point in points}
        (directory / 'springboards.json').write_text(json.dumps({
            'schemaVersion': 1, 'locations': sorted(distinct.values(), key=lambda point: point['id'])
        }, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Published {sum(map(len, locations.values()))} springboards on {len(locations)} shipped maps.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exports', required=True, type=Path)
    parser.add_argument('--tables', required=True, type=Path)
    parser.add_argument('--public', default='public', type=Path)
    args = parser.parse_args()
    publish(args.exports, args.tables, args.public)
