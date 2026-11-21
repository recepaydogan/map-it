"""Publish world-object rules using exact object and reward identities."""
from collections import defaultdict
from importlib import import_module
from context import value, write
import json


def object_rows(ctx):
    return {str(value(row['ID'])): row for row in ctx.rows('EnvObjData')
            if row['RequireType'].endswith('::Item') and row['bIsOptionalRequirement']
            and row['RequireCount'] > 0}


def chest_rows(ctx):
    """Use the source's reward-box resource family, never localized names."""
    return {str(value(row['ID'])): row for row in ctx.rows('EnvObjData')
            if row['ResourceKey'].startswith('RewardBox_') and row['bGetRewardOnce']
            and row['RequireType'].endswith('::None')
            and row['Usage'].split('::')[-1] in ('Normal', 'MapEvent')}


def build(ctx):
    pools = import_module('reward-pools').RewardPools(ctx)
    rewards = {str(value(row['ID'])): row for row in ctx.rows('RewardData')}
    title_items = {row['Name'] for row in ctx.rows('Item') if row.get('UseEffect', '').endswith('::GetTitle')}
    title_achievements = {str(value(row['AchievementId'])) for row in ctx.rows('AchievementReward')
                          if any(item['Item'] in title_items for item in row['ItemRewards'])}
    objectives = defaultdict(list)
    for row in ctx.rows('Achievement'):
        if not row['ObjType'].endswith('::UseEnvObj'):
            continue
        entry = ctx.entries.get('Achievement:' + str(value(row['AchievementId'])))
        if entry and str(value(row['AchievementId'])) in title_achievements:
            for cell in row['ObjValues']:
                for name in cell.split(','):
                    objectives[name.strip()].append({k: entry[k] for k in ('id', 'name', 'category')})
    chests = chest_rows(ctx)
    for identity, row in (object_rows(ctx) | chests).items():
        entry = ctx.entries.get('EnvObjData:' + identity)
        if not entry:
            continue
        reward = rewards.get(identity)
        key_only = row['bIsKeyOnly']
        modes = []
        if reward:
            names = [('normal', reward['RewardName'])] if not key_only else []
            names += [('key', name) for name in reward['BasicKeyRewards']]
            for kind, name in names:
                links = pools.links(name, True, preserve_checks=True)
                if links:
                    modes.append({'kind': kind, 'source': name, 'items': links})
        dungeon_contexts = entry.get('rewardObject', {}).get('dungeonContexts')
        entry['rewardObject'] = {
            'keyOnly': key_only,
            'keys': ctx.item_links([{'Item': name, 'Count': row['RequireCount']} for name in row['RequireValues']]),
            'hiddenOnWorldMap': row['bHideWorldMapMarker'],
            'hiddenOnMiniMap': row['bHideMiniMapMarker'],
            'terrain': row['ObjectTerrainType'].split('::')[-1],
            'modes': modes,
            'achievements': objectives[row['Name']],
        }
        if identity in chests:
            if dungeon_contexts:
                entry['rewardObject']['dungeonContexts'] = dungeon_contexts
            entry['rewardObject']['access'] = {
                'requirement': 'none',
                'interactionSeconds': row['InteractTime'] / 1000,
                'rewardOnce': row['bGetRewardOnce'],
                'eventLinked': row['Usage'].endswith('::MapEvent'),
            }
        # Keep rewards in the shared source graph as well as the object panel.
        entry['sections'] = [section for section in entry['sections']
                             if section['title'] != 'reference.labels.possible-rewards']
        if modes:
            entry['sections'].append({'title': 'reference.labels.possible-rewards', 'showRewardRates': True,
                                     'links': [dict(link, rewardRates=[dict(rate, contextKey='reference.worldObject.' + mode['kind'])
                                               for rate in link.get('rewardRates', [])])
                                               for mode in modes for link in mode['items']]})


def normalize_markers(ctx, map_data):
    """Merge only source-defined alternatives at the same actor and 3D position."""
    sources = import_module('world-marker-sources')
    rows = object_rows(ctx)
    exports = sources.read_exports(map_data)
    remap = {}
    report = []
    for map_id, slug, *_ in import_module('world').MAPS:
        if map_id not in exports:
            continue
        path = ctx.public / 'maps' / slug / 'metadata.json'
        metadata = json.loads(path.read_text('utf8'))
        variants = {}
        for spawn in exports[map_id]['data']['Properties']['Data']['SpawnInfoList']:
            ids = sorted({str(value(cell)) for cell in spawn['EnvObjIdList']})
            if ids and all(identity in rows for identity in ids):
                variants[spawn['Name']] = ids
        groups = defaultdict(list)
        order = {point['id']: index for index, point in enumerate(metadata['locations'])}
        for point in metadata['locations']:
            ids = variants.get(point.get('sourceActor'))
            if ids and point.get('entityId') in ids and point.get('worldPosition'):
                xyz = point['worldPosition']
                groups[(point['sourceActor'], xyz['X'], xyz['Y'], xyz['Z'])].append(point)
        removed = set()
        mixed = 0
        for points in groups.values():
            # Preserve the already published canonical ID on repeated imports.
            canonical = min(points, key=lambda p: (not bool(p.get('aliasIds')), order[p['id']]))
            ids = variants[canonical['sourceActor']]
            canonical['objectVariants'] = [{'id': 'EnvObjData:' + identity, 'category': 'exploration'} for identity in ids]
            mixed += len({rows[identity]['bIsKeyOnly'] for identity in ids}) > 1
            aliases = set(canonical.get('aliasIds', []))
            for point in points:
                if point is not canonical:
                    aliases.add(point['id'])
                    aliases.update(point.get('aliasIds', []))
                    removed.add(point['id'])
            if aliases:
                canonical['aliasIds'] = sorted(aliases)
                remap.update({(slug, alias): canonical['id'] for alias in aliases})
            # Both variant detail pages lead to the one real location.
            for identity in ids:
                entry = ctx.entries.get('EnvObjData:' + identity)
                if entry:
                    entry['locations'].append({'mapId': slug, 'markerId': canonical['id'],
                                               'name': metadata['displayName'] + ' · ' + canonical['name']})
        metadata['locations'] = [p for p in metadata['locations'] if p['id'] not in removed]
        if groups:
            write(path, metadata)
            report.append({'mapId': slug, 'positions': len(groups), 'mixedPositions': mixed,
                           'retainedAliases': sum(len(p.get('aliasIds', [])) for points in groups.values() for p in points if p['id'] not in removed),
                           'removedDuplicateMarkers': len(removed), 'source': exports[map_id]['asset']})
    for entry in ctx.entries.values():
        for location in entry.get('locations', []):
            location['markerId'] = remap.get((location['mapId'], location['markerId']), location['markerId'])
        entry['locations'] = list({(loc['mapId'], loc['markerId']): loc for loc in entry.get('locations', [])}.values())
    write(ctx.public / 'data/reference/world-object-audit.json', {'version': 1, 'maps': report,
          'missingRewardIds': [entry['id'] for entry in ctx.entries.values()
                               if entry.get('rewardObject') and not entry['rewardObject']['modes']]})
    return report
