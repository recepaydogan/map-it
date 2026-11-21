"""Join collectible rewards to progression tracks and existing map markers."""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path


def publish(tables, localization, public):
    tables, public = Path(tables), Path(public)
    strings = {k.casefold(): v for k, v in json.loads(Path(localization).read_text('utf8'))['Entries'].items()}

    def rows(name):
        return json.loads((tables / (name + '.json')).read_text('utf8'))['Properties']['Data']

    def text(key):
        key = key.get('Key', '') if isinstance(key, dict) else key
        result = strings.get(key.casefold()) or strings.get(('String_' + key + '_body').casefold())
        if not result:
            raise ValueError('Missing collectible localization: ' + key)
        return result

    items = {r['Name']: r for r in rows('Item')}
    catalog = {r['id']: r for r in json.loads((public / 'data/items/catalog.json').read_text('utf8'))['items']}

    def item_link(code, count=None):
        item = items[code]
        record = catalog[str(item['ID']['Value'])]
        return {'id': record['id'], 'category': 'items', 'name': record['name'],
                **({'icon': record['icon']} if record.get('icon') else {}),
                **({'quantity': count} if count is not None else {})}

    monoliths = rows('Monolith')
    tokens = {r['TokenItem'] for r in monoliths}
    envs = {r['ID']['Value']: r for r in rows('EnvObjData')}
    reward_items = defaultdict(list)
    for r in rows('RewardItem'):
        for item in r['Items']:
            if item['ItemName'] in tokens:
                if item['ItemCountMin'] != item['ItemCountMax'] or item['ItemProb'] != 100000000:
                    raise ValueError('Collectible reward must have a fixed guaranteed quantity')
                reward_items[r['Name']].append(item)
    env_tokens = {}
    for r in rows('RewardData'):
        if r['RewardName'] in reward_items:
            rewards = reward_items[r['RewardName']]
            if len(rewards) != 1:
                raise ValueError('Ambiguous collectible reward: ' + r['RewardName'])
            env_tokens[r['ID']['Value']] = rewards[0]

    objectives = defaultdict(list)
    for r in rows('Achievement'):
        if r['ObjType'] == 'EAchievementObjectiveType::UseEnvObjSpawnerName':
            for name in r['ObjValues']:
                objectives[name].append(r)
    metadata = {p.parent.name: (p, json.loads(p.read_text('utf8'))) for p in sorted((public / 'maps').glob('*/metadata.json'))}
    index = json.loads((public / 'data/reference/index.json').read_text('utf8'))
    references = {r['id']: r for r in index['entries']}
    found = defaultdict(list)
    turn_in = defaultdict(list)
    for map_id, (_, data) in metadata.items():
        for point in data.get('locations', []):
            entity_id = int(point.get('entityId', 0))
            env = envs.get(entity_id)
            if env and env['Usage'] == 'EEnvObjectUsage::Monolith':
                for key in ('UsageValue', 'UsageValue2'):
                    if env[key] != 'None':
                        turn_in[env[key]].append({'mapId': map_id, 'markerId': point['id'],
                            'name': point.get('region') or data['displayName'], 'x': point['x'], 'y': point['y']})
            reward = env_tokens.get(entity_id)
            if not reward or point.get('sourceActor') not in objectives or point.get('hiddenFromMap'):
                continue
            if len(objectives[point['sourceActor']]) != 1:
                raise ValueError('Ambiguous collectible objective: ' + point['sourceActor'])
            item_id = str(items[reward['ItemName']]['ID']['Value'])
            point['itemId'] = item_id
            found[item_id].append((map_id, point, reward, env))

    # Preserve completion on the earlier rounded-coordinate layers. Matches must
    # be close, unambiguous at the nearest distance, and one-to-one per layer.
    for map_id, (_, data) in metadata.items():
        layer = public / 'maps' / map_id / 'collectables.json'
        if not layer.exists():
            continue
        assigned = set()
        for old in json.loads(layer.read_text('utf8'))['locations']:
            candidates = [(math.hypot(point['x'] - old['x'], point['y'] - old['y']), point)
                          for host, point, _, _ in found.get(old.get('itemId'), []) if host == map_id]
            candidates.sort(key=lambda pair: pair[0])
            if not candidates:
                continue
            distance, canonical = candidates[0]
            if distance > 1 or canonical['id'] in assigned or (len(candidates) > 1 and abs(distance - candidates[1][0]) < 0.000001):
                raise ValueError('Cannot safely migrate collectible marker: ' + old['id'])
            assigned.add(canonical['id'])
            canonical['aliasIds'] = sorted(set(canonical.get('aliasIds', [])) | {old['id']})

    stats = {r['StatName']: r for r in rows('StatCorrectionNumber')}
    rewards = {r['Name']: r for r in rows('RewardMonolith')}
    levels = rows('MonolithLevel')
    output = {'version': 1, 'items': {}, 'references': {}}
    for code in sorted(tokens):
        item = item_link(code)
        points = found[item['id']]
        if not points or len({point['sourceActor'] for _, point, _, _ in points}) != len(points):
            raise ValueError('Missing or duplicate collectible points: ' + code)
        regions = {}
        for map_id, point, reward, env in points:
            _, map_data = metadata[map_id]
            inset = point.get('insetId', '')
            region_id = map_id + (':' + inset if inset else '')
            regions.setdefault(region_id, {'id': region_id, 'mapId': map_id,
                'name': next((r['name'] for r in map_data.get('regions', []) if r['id'] == inset), map_data['displayName']), 'points': []})
            terrain = env['ObjectTerrainType'].split('::')[-1].lower()
            if terrain not in ('ground', 'air', 'water'):
                raise ValueError('Unknown collectible terrain: ' + terrain)
            regions[region_id]['points'].append({'id': point['id'], 'aliases': point.get('aliasIds', []),
                'name': point.get('region') or regions[region_id]['name'], 'terrain': terrain,
                'x': point['x'], 'y': point['y'], 'world': point['worldPosition'], 'quantity': reward['ItemCountMin']})
        tracks = []
        for m in (m for m in monoliths if m['TokenItem'] == code):
            ref_id = 'Monolith:' + str(m['ID']['Value'])
            summary = references[ref_id]
            track = {'id': ref_id, 'name': summary['name'], 'category': summary['category'],
                     'faction': m['Race'].split('::')[-1], 'locations': turn_in[m['Name']], 'levels': []}
            for level in sorted((r for r in levels if r['MonolithName'] == m['Name']), key=lambda r: r['Level']):
                row = {'level': level['Level'], 'items': [], 'stats': []}
                for reward in rewards.get(level['Reward'], {'RewardList': []})['RewardList']:
                    if reward['Type'] == 'EMonolithRewardType::Item':
                        row['items'].append(item_link(reward['Item']['Item'], reward['Item']['Count']))
                    elif reward['Type'] == 'EMonolithRewardType::Stat':
                        stat = stats[reward['StatType']]
                        # Keep amounts requiring unverified display scaling out of
                        # player-facing totals while still identifying the reward.
                        confirmed_unit = stat['StatUnit'] == 1 and 'Percent' not in stat['IndicationStatWindow']
                        row['stats'].append({'id': reward['StatType'], 'name': text(stat['Desc']),
                            'value': reward['StatValue'] if confirmed_unit else None})
                    else:
                        raise ValueError('Unsupported progression reward')
                track['levels'].append(row)
            tracks.append(track)
            output['references'][ref_id] = item['id']
        exchanges = []
        for recipe in rows('ConversionRecipe'):
            components = recipe['ComponentList']
            if len(components) == 1 and components[0]['Item'] == code and recipe['RegisterType'] == 'EConversionRegisterType::MonolithLevel':
                target = next((track for track in tracks if track['id'] == 'Monolith:' + str(next(m['ID']['Value'] for m in monoliths if m['Name'] == recipe['RegisterValue2']))), None)
                if target is None or recipe['SuccessProp'] != 10000:
                    raise ValueError('Unverified collectible exchange')
                exchanges.append({'id': 'ConversionRecipe:' + str(recipe['ID']['Value']), 'level': recipe['RegisterValue'],
                    'trackId': target['id'], 'cost': components[0]['Count'],
                    'result': item_link(recipe['Product'], recipe['ProductCount']), 'characterLimit': recipe['LimitCharacterCount']})
        output['items'][item['id']] = {'item': item, 'regions': sorted(regions.values(), key=lambda region: -len(region['points'])), 'tracks': tracks, 'exchanges': exchanges}

    # Enrichment is additive: all existing marker IDs, source records and personal
    # aliases remain intact. Aliases let the runtime omit duplicate legacy pins.
    for _, (path, data) in metadata.items():
        content = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        original = json.loads(path.read_text('utf8'))
        if original != data:
            path.write_text(content + '\n', encoding='utf8')
    destination = public / 'data/reference/intelligence/collectible-progression.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    result = publish(args.tables, args.localization, args.public)
    print(json.dumps({'items': len(result['items']), 'tracks': len(result['references']),
                      'points': sum(len(r['points']) for c in result['items'].values() for r in c['regions'])}))
