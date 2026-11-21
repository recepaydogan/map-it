"""Publish guild hall rental facts and source-positioned world entrances."""
import argparse
import hashlib
import json
from pathlib import Path
from importlib import import_module

from context import value, write
from world import MAPS


def attach(rows, entries, public, map_data):
    sources = import_module('world-marker-sources')
    slugs = {map_id: slug for map_id, slug, *_ in MAPS}
    exports = sources.read_exports(map_data)
    updated = []
    for row in rows:
        hall_id = value(row['MapId'])
        base_id = value(row['BaseMapId'])
        reference_id = f'Dungeon:{hall_id}'
        entry = entries.get(reference_id)
        if not entry or entry.get('group') != 'Guild' or base_id not in slugs:
            raise ValueError(f'Guild hall has no matching dungeon or world map: {hall_id}')
        if row['CostCurrencyType'] != 'ECurrencyCategory::GoldCombined':
            raise ValueError(f'Unrecognized guild hall rental currency: {hall_id}')
        export = exports[base_id]
        triggers = [item['Value'] for item in export['data']['Properties']['Data']['TriggerActorDataMap']
                    if value(item['Value'].get('DungeonId')) == hall_id
                    and item['Value'].get('FuncType') == 'ETriggerActorFuncType::EnterInstanceLayer']
        if len(triggers) != 1:
            raise ValueError(f'Expected one world entrance for guild hall {hall_id}, found {len(triggers)}')
        trigger = triggers[0]
        slug = slugs[base_id]
        path = public / 'maps' / slug / 'metadata.json'
        metadata = json.loads(path.read_text('utf8'))
        if metadata['worldProjection']['mapId'] != base_id:
            raise ValueError(f'Guild hall entrance projection mismatch: {hall_id}')
        world = trigger['Location']
        xy = sources.project(world, metadata['worldProjection'], metadata['bounds'])
        bounds = metadata['bounds']
        if not (bounds['minX'] <= xy['x'] <= bounds['maxX'] and bounds['minY'] <= xy['y'] <= bounds['maxY']):
            raise ValueError(f'Guild hall entrance outside world map: {hall_id}')
        digest = hashlib.sha256(f'{base_id}/{reference_id}/{value(trigger["ID"])}'.encode()).hexdigest()[:16]
        marker_id = f'{slug}-guild-hall-{digest}'
        marker = next((point for point in metadata['locations'] if point['id'] == marker_id), None)
        if marker is None:
            marker = {'id': marker_id}
            metadata['locations'].append(marker)
        marker.update({**xy, 'name': entry['name'], 'category': 'guild-hall',
                       'reference': {'id': reference_id, 'category': 'dungeons'},
                       'entityId': str(value(trigger['ID'])), 'sourceActor': trigger['Name'],
                       'sourceAsset': export['asset'], 'worldPosition': world, 'elevation': world['Z']})
        marker.pop('hiddenFromMap', None)
        write(path, metadata)
        entry['guildHall'] = {'rentalCost': row['RentalCost'], 'rentalDays': row['RentalDay'],
                              'extensionWindowDays': row['RentalLimitDay'], 'legionLevel': row['RentalLevel']}
        location = {'mapId': slug, 'markerId': marker_id,
                    'name': metadata['displayName'] + ' · ' + entry['name']}
        entry['locations'] = [existing for existing in entry['locations']
                              if existing['markerId'] != marker_id] + [location]
        updated.append(reference_id)
    return updated


def build(ctx, map_data):
    return attach(ctx.rows('GuildAgit'), ctx.entries, ctx.public, map_data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True, type=Path)
    parser.add_argument('--public', default='public', type=Path)
    parser.add_argument('--map-data', required=True, type=Path)
    args = parser.parse_args()
    rows = json.loads((args.tables / 'GuildAgit.json').read_text('utf8'))['Properties']['Data']
    entries = {}
    chunks = {}
    for row in rows:
        reference_id = f'Dungeon:{value(row["MapId"])}'
        bucket = hashlib.sha256(reference_id.encode()).hexdigest()[:2]
        path = args.public / 'data/reference/dungeons' / (bucket + '.json')
        chunks[path] = json.loads(path.read_text('utf8'))
        entries[reference_id] = chunks[path]['entries'][reference_id]
    updated = attach(rows, entries, args.public, args.map_data)
    for path, chunk in chunks.items():
        write(path, chunk)
    print('Updated guild halls: ' + ', '.join(updated))
