"""Publish compact, linked player tools from the same decoded snapshot as the reference catalog."""
import argparse
import hashlib
import importlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, human, value, write


def publish(tables, localization, public, map_data):
    ctx = Context(tables, localization, public)
    destination = ctx.public / 'data/reference/intelligence'
    reference = json.loads((ctx.public / 'data/reference/index.json').read_text('utf8'))
    summaries = {s['id']: s for s in reference['entries']}
    imported = {r['name']: r for r in json.loads((ctx.public / 'data/reference/manifest.json').read_text('utf8'))['tables']}
    outputs = {}

    def link(identity):
        row = ctx.items.get(identity) or summaries.get(identity)
        if not row:
            return None
        return {**{k: row[k] for k in ('id', 'name', 'icon') if k in row}, 'category': 'items' if identity in ctx.items else row['category']}

    def item_link(name):
        return link(ctx.item_names.get(str(name).casefold(), str(name)))

    def emit(name, **content):
        outputs[name] = {'version': 1, **content}

    stat_rows = {r['StatName']: r for r in ctx.rows('StatCorrectionNumber')}

    def stats(values):
        result = []
        for r in values:
            key = r.get('Stat', r.get('StatType', r.get('Key')))
            raw = r.get('StatValue', r.get('Value'))
            definition = stat_rows.get(key, {})
            percent = 'Percent' in definition.get('IndicationStatWindow', '')
            result.append({'key': key, 'name': ctx.text(definition.get('Desc'), human(key)),
                           'value': raw / 100 if percent else raw, 'percent': percent,
                           'description': ctx.text(definition.get('UIDesc'))})
        return result

    items = ctx.rows('Item')
    by_name = {r['Name']: r for r in items}
    npcs = {value(r['ID']): r for r in ctx.rows('NpcData')}
    # Preserve actual group identity, costs, terminal levels and failure semantics.
    upgrade_groups = {}
    for table, field in [('Enchant', 'EnchantGroup'), ('ExceedEnchant', 'ExceedEnchantGroup'), ('ItemSurpass', 'SurpassGroup')]:
        used = {r.get(field) for r in items}
        for r in ctx.rows(table):
            if r['Group'] not in used:
                continue
            materials = []
            for cost in r['CostItems']:
                target = item_link(cost['Item'])
                if target:
                    materials.append({**target, 'quantity': cost['Count'], 'level': cost['EnchantedLevel']})
            upgrade_groups.setdefault(table + ':' + r['Group'], []).append({
                'level': r['CurrentLevel'], 'probability': r['SuccessProb'] / 10000,
                'correction': r['FailCorrectionProb'] / 10000, 'penalty': r.get('FailPenalty'),
                'gold': r['CostGold'], 'currency': human(r['CostCurrencyType']), 'materials': materials,
                'costsComplete': len(materials) == len(r['CostItems']),
            })
    emit('upgrades', groups=upgrade_groups)

    # Equipment search and details share a single class-specific pool index.
    pools = defaultdict(list)
    for r in ctx.rows('ItemEquipSubstatSkill'):
        skill = link('Skill:' + str(value(r['SkillId'])))
        if skill:
            pools[r['Group']].append({'class': human(r['Class']), 'skill': skill, 'base': r['SkillLevelBaseValue'],
                                     'maximum': r['SkillLevelMaxValue'], 'weight': r['SkillRandomProb']})
    gear = {str(value(r['ID'])): r['SoulbindRandomSkillGroup'] for r in items
            if r.get('bUseSubStatSkill') and r.get('SoulbindRandomSkillGroup') in pools}
    emit('skill-rolls', items=gear, pools=pools)

    # Map coordinates remain distinct from static/reference marker identities.
    maps = {}
    for filename in sorted((ctx.public / 'maps').glob('*/metadata.json')):
        m = json.loads(filename.read_text('utf8'))
        if 'worldProjection' in m:
            maps[m['worldProjection']['mapId']] = (filename.parent.name, m)
    npc_points, spawn_points = defaultdict(list), defaultdict(list)
    spawn_entities = defaultdict(set)
    map_hashes = []

    def projected(map_id, world):
        if map_id not in maps:
            return None
        slug, m = maps[map_id]
        projection, bounds = m['worldProjection'], m['bounds']
        point = {axis.lower(): round(bounds['min' + axis] + (world[axis] - projection['origin'][axis])
                 * (bounds['max' + axis] - bounds['min' + axis]) / projection['size'][axis], 3) for axis in ('X', 'Y')}
        if any(point[a.lower()] < bounds['min' + a] or point[a.lower()] > bounds['max' + a] for a in ('X', 'Y')):
            return None
        return {'mapId': slug, 'mapName': m['displayName'], **point}

    for filename in sorted(Path(map_data).glob('*.json')):
        raw = filename.read_bytes()
        exported = json.loads(raw)
        if '/InstanceLayer/' in exported['asset']:
            continue
        m = exported['data']['Properties']['Data']
        map_id = value(m['MapId'])
        map_hashes.append({'file': filename.name, 'sha256': hashlib.sha256(raw).hexdigest()})
        for spawn in m.get('SpawnInfoList', []):
            spawn_entities[(map_id, spawn['Name'])].update(value(cell) for cell in spawn['EnvObjIdList'])
            for transform in spawn['Positions']:
                point = projected(map_id, transform['Location'])
                if point:
                    point = {**point, 'conditional': spawn.get('MaintainingTag', 'None') != 'None'}
                    spawn_points[(map_id, spawn['Name'])].append(point)
                    for cell in spawn['NpcIdList']:
                        npc_points[value(cell)].append(point)

    def distinct(points):
        return list({(p['mapId'], p['x'], p['y'], p.get('conditional', False)): p for p in points}.values())

    loot = defaultdict(list)
    for r in ctx.rows('NpcLoot'):
        target = link('NpcData:' + str(value(r['NpcId'])))
        if target:
            loot[value(r['VehicleSoulItemId'])].append({
                'npc': target, 'points': distinct(npc_points[value(r['NpcId'])]),
            })
    companions = {}
    for r in ctx.rows('VehicleList'):
        soul = by_name.get(r['SoulItemName'])
        if soul:
            companions['VehicleList:' + str(value(r['ID']))] = {'required': r['NeedSoul'], 'soul': item_link(r['SoulItemName']),
                'sources': loot[value(soul['ID'])], 'available': r['bIsOpen']}
    emit('companions', entries=companions)

    route_rows = {value(r['ItemId']): r for r in ctx.rows('ItemGetRoute')}
    title_items = defaultdict(list)
    for r in items:
        if r.get('UseEffect') == 'EItemUseEffect::GetTitle':
            for target in r['UseEffectValues']:
                title_items[target].append(r)
    artwork_path = ctx.public / 'data/reference/title-artwork-sources.json'
    title_artwork = json.loads(artwork_path.read_text('utf8'))['titles'] if artwork_path.exists() else {}
    titles = {}
    for r in ctx.rows('Title'):
        sources = {}
        unlocks = title_items[str(value(r['ID']))] + title_items[r['Name']]
        for item in unlocks:
            route = route_rows.get(value(item['ID']), {})
            for quest in route.get('QuestGetRoutes', []):
                source = link('Quest:' + str(value(quest['QuestId'])))
                if source:
                    sources[source['id']] = source
        title_id = 'Title:' + str(value(r['ID']))
        titles[title_id] = {
            'faction': human(r['Race']), 'passive': stats(r['StatList']), 'equipped': stats(r['EquipStatList']),
            'items': [target for item in unlocks if (target := item_link(item['Name']))], 'sources': list(sources.values()),
            'visible': r['bShow'], 'dated': bool(r['StartTime']['Ticks'] or r['EndTime']['Ticks']),
            **({'artwork': title_artwork[title_id]} if title_id in title_artwork else {}),
        }
    importlib.import_module('title-acquisition').add_first_kill_sources(titles, ctx.public)
    emit('titles', entries=titles)

    objectives = []
    collection_factions = {r['GroupName']: human(r['Race']) for r in ctx.rows('PeriodItemCollection')}
    for r in ctx.rows('PeriodItemCollectionList'):
        target = link('PeriodItemCollectionList:' + str(value(r['ID'])))
        if not target:
            continue
        objectives.append({'target': target, 'faction': collection_factions.get(r['GroupName'], ''), 'count': r['TargetCount'],
            'items': [l['id'] for item in r['TargetItems'] if (l := item_link(item['Item']))],
            'rewards': [{**l, 'quantity': item['Count']} for item in r['RewardItems'] if (l := item_link(item['Item']))]})
    emit('collections', objectives=objectives)

    combat = {}
    for npc_id, r in npcs.items():
        if r['bUseBossBerserk'] or r['GroggyTime'] > 0:
            combat['NpcData:' + str(npc_id)] = {'berserkSeconds': r['BossBerserkInvokeTime'] if r['bUseBossBerserk'] else None,
                                              'groggySeconds': r['GroggyTime'] / 1000 if r['GroggyTime'] else None}
    emit('combat', entries=combat)

    skin_unlocks = defaultdict(list)
    for r in items:
        if r.get('UseEffect') == 'EItemUseEffect::GetSkin':
            for skin in r['UseEffectValues']:
                if target := item_link(r['Name']):
                    skin_unlocks[skin].append(target)
    skin_rows = []
    for r in ctx.rows('Skin'):
        name = ctx.text(r['DescLight']) or ctx.text(r['DescDark'])
        if not name or not r['bShow']:
            continue
        skin_rows.append({'id': str(value(r['ID'])), 'name': name, 'items': skin_unlocks[r['Name']]})
    emit('skins', skins=skin_rows)

    named = ctx.rows('WorldMapFieldNamed')
    rift_ids = {row['Name']: str(value(row['ID'])) for row in ctx.rows('RiftData')}
    env_objects = {value(row['ID']): row for row in ctx.rows('EnvObjData')}
    schedules = []
    for r in ctx.rows('PeriodSpawn'):
        matched = [n for n in named if value(n['PeriodSpawnId']) == value(r['ID'])]
        names = {n['Name']: n for n in npcs.values()}
        targets = [l for n in matched if (npc := names.get(n['FieldNamedName'])) and (l := link('NpcData:' + str(value(npc['ID']))))]
        fallback = link('PeriodSpawn:' + str(value(r['ID'])))
        anchor = r['Time']['Ticks'] // 600000000
        cycle = r['Cycle']
        entities = spawn_entities[(value(r['MapId']), r['SpawnerName'])]
        if not targets and len(entities) != 1:
            raise ValueError('Rift schedule requires one source object: ' + r['SpawnerName'])
        source_object = env_objects.get(next(iter(entities))) if not targets else None
        rift_id = rift_ids.get(source_object['UsageValue']) if source_object and source_object['Usage'] == 'EEnvObjectUsage::Rift' else None
        if human(r['SpawnType']) == 'Cycle':
            if cycle <= 0 or 1440 % cycle:
                raise ValueError('Unsupported schedule cycle')
            minutes = [minute for minute in range(1440) if (minute - anchor) % cycle == 0]
        else:
            minutes = [anchor]
        schedules.append({'id': str(value(r['ID'])), 'name': targets[0]['name'] if targets else '',
            'sourceMapId': value(r['MapId']), 'spawnerName': r['SpawnerName'],
            **({'entityId': str(next(iter(entities)))} if not targets else {}),
            **({'riftId': 'RiftData:' + rift_id} if rift_id else {}),
            **({'cycleMinutes': cycle} if human(r['SpawnType']) == 'Cycle' else {}),
            'kind': 'boss' if targets else 'rift', 'targets': targets or ([fallback] if fallback else []),
            'days': [i for i, day in enumerate(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) if r['b' + day]],
            'minutes': minutes, 'points': distinct(spawn_points[(value(r['MapId']), r['SpawnerName'])])})
    emit('schedules', schedules=schedules)

    source_records = []
    for name, data in sorted(ctx.cache.items()):
        digest = hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest()
        if name in imported and digest != imported[name]['sha256']:
            raise ValueError('Decoded source differs from the published reference snapshot: ' + name)
        source_records.append({'name': name, 'rows': len(data), 'sha256': digest})
    for name, data in outputs.items():
        write(destination / (name + '.json'), data)
    manifest = {'version': 1, 'tables': source_records, 'maps': map_hashes,
        'localizationSha256': hashlib.sha256(Path(localization).read_bytes()).hexdigest(),
        'outputs': {name: {'bytes': (destination / (name + '.json')).stat().st_size,
                         'sha256': hashlib.sha256((destination / (name + '.json')).read_bytes()).hexdigest()} for name in outputs}}
    write(destination / 'manifest.json', manifest)
    print(json.dumps({'files': len(outputs), 'skillItems': len(gear), 'titles': len(titles), 'companions': len(companions), 'skins': len(skin_rows)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ('tables', 'localization', 'map-data'):
        parser.add_argument('--' + option, required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    publish(args.tables, args.localization, args.public, args.map_data)
