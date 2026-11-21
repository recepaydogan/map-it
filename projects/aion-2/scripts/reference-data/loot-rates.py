"""Attach loot probabilities to source entries, preserving conditional contexts."""
from collections import defaultdict
from importlib import import_module
import hashlib
import json
from context import value, write


def update_marker_rates(ctx):
    manifest_path = ctx.public / 'data/items/source-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    for record in manifest['acquisition']['markerChunks']:
        path = ctx.public / record['path']
        chunk = json.loads(path.read_text(encoding='utf8'))
        metadata = json.loads((ctx.public / 'maps' / record['mapId'] / 'metadata.json').read_text(encoding='utf8'))
        references = {point['id']: point.get('reference', {}).get('id') for point in metadata['locations']}
        changed = False
        for marker_id, items in chunk['markers'].items():
            entry = ctx.entries.get(references.get(marker_id))
            if not entry:
                continue
            rates = {link['id']: link.get('rewardRates', []) for section in entry['sections']
                     if section['title'] in ('reference.labels.possible-drops', 'reference.labels.guaranteed-drops')
                     for link in section.get('links', [])}
            for item in items:
                if item.get('rewardRates', []) != rates.get(item['id'], []):
                    item['rewardRates'] = rates.get(item['id'], [])
                    changed = True
        if changed:
            write(path, chunk)
            record.update({'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    write(manifest_path, manifest)


def merge_links(links):
    merged = {}
    for link in links:
        if not link:
            continue
        target = merged.setdefault(link['id'], {**link, 'rewardRates': []})
        for rate in link.get('rewardRates', []):
            if rate not in target['rewardRates']:
                target['rewardRates'].append(rate)
    return list(merged.values())


def replace_section(entry, title, **content):
    section = next((s for s in entry['sections'] if s['title'] == title), None)
    if section is None:
        entry['sections'].append({'title': title, **content})
    else:
        section.update(content)


def build(ctx):
    pools = import_module('reward-pools').RewardPools(ctx)
    rewards = {value(r['ID']): r for r in ctx.rows('RewardData')}
    scales = defaultdict(list)
    for row in ctx.rows('LevelScaleDropGroup'):
        scales[row['GroupLevelscaleReward']].append(row)
    for npc in ctx.rows('NpcData'):
        entry = ctx.entries.get('NpcData:' + str(value(npc['ID'])))
        reward = rewards.get(value(npc['ID']))
        if not entry:
            continue
        links = [link for section in entry['sections'] if section['title'] in
                 ('reference.labels.possible-drops', 'reference.labels.guaranteed-drops')
                 for link in section.get('links', [])]
        # Rebuild metadata rather than retaining rates from an older export.
        links = [{k: v for k, v in link.items() if k != 'rewardRates'} for link in links]
        if reward:
            sources = {reward['RewardName']: {'contextKey': 'reference.loot.main'}}
            for field in ('BasicRewardName', 'LevelscaleBasicRewardName', 'BasicKeyRewards'):
                for name in reward[field]:
                    sources.setdefault(name, {'contextKey': 'reference.loot.key' if field == 'BasicKeyRewards' else 'reference.loot.additional'})
            for field in ('BasicRewardNameNoLvgap', 'LevelscaleBasicRewardNameNoLvgap'):
                sources.setdefault(reward[field], {'contextKey': 'reference.loot.additional'})
            for scale in scales[reward['GroupLevelscaleRewardName']]:
                if scale['LevelMin'] <= npc['Level'] <= scale['LevelMax']:
                    sources.setdefault(scale['Name'], {'contextKey': 'reference.loot.levelScaled', 'levelMin': scale['LevelMin'], 'levelMax': scale['LevelMax']})
            for name, context in sources.items():
                if name != 'None':
                    links.extend(pools.links(name, include_rates=True, context=context))
        links = merge_links(links)
        if not links:
            continue
        # Only unconditional individual main-table rows qualify here. Shared,
        # participation, key and package rewards keep their conditional status.
        guaranteed = [link for link in links if any(
            rate['kind'] == 'direct' and rate['percent'] >= 100 and rate['quantityMin'] > 0
            and rate.get('contextKey') == 'reference.loot.main' and not rate.get('faction')
            for rate in link['rewardRates'])]
        guaranteed_ids = {link['id'] for link in guaranteed}
        entry['sections'] = [s for s in entry['sections'] if s['title'] not in
                             ('reference.labels.possible-drops', 'reference.labels.guaranteed-drops')]
        if guaranteed:
            replace_section(entry, 'reference.labels.guaranteed-drops', links=guaranteed, showRewardRates=True)
        possible = [link for link in links if link['id'] not in guaranteed_ids]
        if possible:
            replace_section(entry, 'reference.labels.possible-drops', links=possible, showRewardRates=True)

    for table in ('BoxReward', 'BoxClassReward'):
        for index, box in enumerate(ctx.rows(table)):
            entry = ctx.entries.get(table + ':' + str(index))
            if entry and box['PackageItems']:
                replace_section(entry, 'reference.labels.possible-contents',
                                links=pools.package_links(box['PackageItems'], box['Race'], 10_000), showRewardRates=True)

    cubes = defaultdict(list)
    for row in ctx.rows('RewardDataMonsterCube'):
        cubes[row['GroupName']].append(row)
    for row in ctx.rows('FieldEvent'):
        entry = ctx.entries.get('FieldEvent:' + str(value(row['ID'])))
        if entry and cubes[row['RewardMonsterCube']]:
            replace_section(entry, 'reference.labels.possible-rewards', showRewardRates=True, rows=[{
                'name': str(cube['MinLevel']) + '–' + str(cube['MaxLevel']),
                'links': merge_links(pools.links(cube['RewardKey'], True, {'contextKey': 'reference.loot.key'})
                                     + pools.links(cube['RewardCommon'], True)),
            } for cube in cubes[row['RewardMonsterCube']]])

    decompositions = defaultdict(list)
    for row in ctx.rows('RewardDecomposePackage'):
        decompositions[row['Name']].append(row)
    for name, rows in decompositions.items():
        entry = ctx.entries.get('RewardDecomposePackage:' + name)
        if entry:
            replace_section(entry, 'reference.labels.possible-dismantling-results', showRewardRates=True, rows=[{
                'name': '+' + str(row['EnchantLevel']),
                'links': pools.package_links(row['Packages']),
            } for row in rows])
    import_module('creature-rewards').build(ctx)
    import_module('creature-title-rewards').build(ctx)
    update_marker_rates(ctx)
