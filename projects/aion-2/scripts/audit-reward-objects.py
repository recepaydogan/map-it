"""Export source-backed chest positions and rewards without asserting live state."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import importlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value, write


def audit(args):
    ctx = Context(args.tables, args.localization, args.public)
    objects = importlib.import_module('world-object-rewards').chest_rows(ctx)
    rewards = {str(value(row['ID'])): row for row in ctx.rows('RewardData')}
    pools = importlib.import_module('reward-pools').RewardPools(ctx)
    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    manifest = json.loads((ctx.public / 'data/reference/manifest.json').read_text('utf8'))
    hashes = {row['name']: row['sha256'] for row in manifest['tables']}
    tables = {}
    for name in ('EnvObjData', 'RewardData', 'RewardItem', 'RewardPackage', 'RewardPackageItem', 'Item', 'Map'):
        digest = hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest()
        if hashes.get(name) != digest:
            raise ValueError('Source version mismatch: ' + name)
        tables[name] = digest
    published = defaultdict(list)
    for path in sorted((ctx.public / 'maps').glob('*/metadata.json')):
        metadata = json.loads(path.read_text('utf8'))
        for point in metadata['locations']:
            identity = point.get('reference', {}).get('id', '').removeprefix('EnvObjData:')
            if identity in objects and point.get('worldPosition'):
                key = (identity, point.get('sourceAsset'), point.get('sourceActor'),
                       tuple(point['worldPosition'][axis] for axis in ('X', 'Y', 'Z')))
                published[key].append({'mapId': path.parent.name, 'markerId': point['id']})
    records, sources, seen = [], [], set()
    for path in sorted(Path(args.map_data).glob('*.json')):
        raw = path.read_bytes()
        export = json.loads(raw)
        data = export['data']['Properties']['Data']
        map_id = value(data['MapId'])
        layer = '/InstanceLayer/' in export['asset']
        found = False
        for spawn in data['SpawnInfoList']:
            for identity in sorted({str(value(cell)) for cell in spawn['EnvObjIdList']} & objects.keys()):
                obj = objects[identity]
                reward = rewards.get(identity, {})
                links = pools.links(reward.get('RewardName', ''), True, preserve_checks=True)
                for index, position in enumerate(spawn['Positions']):
                    point = position['Location']
                    record_id = f'{map_id}:{spawn["UniqueKey"]}:{identity}:{index}'
                    if record_id in seen:
                        raise ValueError('Duplicate source identity: ' + record_id)
                    seen.add(record_id)
                    key = (identity, export['asset'], spawn['Name'], tuple(point[axis] for axis in ('X', 'Y', 'Z')))
                    records.append({
                        'id': record_id, 'objectId': identity, 'objectName': obj['Name'],
                        'displayName': ctx.text(obj['Desc']), 'mapId': map_id,
                        'mapName': maps.get(map_id, {}).get('Name'),
                        'mapDisplayName': ctx.text(maps.get(map_id, {}).get('Desc')),
                        'spawnId': spawn['UniqueKey'], 'spawnName': spawn['Name'],
                        'sourceAsset': export['asset'], 'instanceLayer': layer,
                        'position': point, 'usage': obj['Usage'].split('::')[-1],
                        'interactionSeconds': obj['InteractTime'] / 1000,
                        'requireType': obj['RequireType'].split('::')[-1],
                        'rewardOnce': obj['bGetRewardOnce'],
                        'interactConditions': obj['InteractConditionList'],
                        'rewardName': reward.get('RewardName'), 'rewards': links,
                        'publishedMarkers': published[key],
                    })
                    found = True
        if found:
            sources.append({'file': path.name, 'asset': export['asset'], 'sha256': hashlib.sha256(raw).hexdigest()})
    if not records:
        raise ValueError('No chest positions found in the decoded map exports')
    counts = Counter((r['objectId'], r['displayName'], r['instanceLayer']) for r in records)
    output = Path(args.output)
    write(output / 'reward-object-spawns.json', {'version': 1, 'tables': tables,
          'localizationSha256': hashlib.sha256(Path(args.localization).read_bytes()).hexdigest(),
          'sources': sources, 'records': records}, indent=2)
    with (output / 'reward-object-spawns.csv').open('w', encoding='utf8', newline='') as stream:
        fields = ['id', 'objectId', 'displayName', 'mapId', 'mapName', 'spawnId', 'spawnName',
                  'sourceAsset', 'instanceLayer', 'x', 'y', 'z', 'usage', 'rewardName', 'rewards', 'publishedMarkers']
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for record in records:
            row = {key: record.get(key) for key in fields}
            row.update({axis.lower(): record['position'][axis] for axis in ('X', 'Y', 'Z')})
            for key in ('rewards', 'publishedMarkers'):
                row[key] = json.dumps(row[key], ensure_ascii=False, separators=(',', ':'))
            writer.writerow(row)
    print(json.dumps({'positions': len(records), 'published': sum(bool(r['publishedMarkers']) for r in records),
                      'objects': [{'id': identity, 'name': name, 'instanceLayer': layer, 'positions': count}
                                  for (identity, name, layer), count in sorted(counts.items())]}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('tables', 'localization', 'map-data', 'output'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--public', default='public')
    audit(parser.parse_args())
