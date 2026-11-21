"""Resolve challenge rewards and field-boss context through exact table keys."""
from collections import defaultdict
from context import value

SOURCE_TABLES = ('BossChallengeContents', 'BossChallengeGroup', 'BossChallengeReward',
                 'NpcData', 'WorldMapFieldNamed', 'PeriodSpawn', 'Map', 'Item')
REWARD_TITLES = ('reference.labels.first-clear-rewards', 'reference.labels.repeat-rewards')


def build(ctx):
    npcs = {row['Name']: row for row in ctx.rows('NpcData')}
    groups = {row['Name']: row for row in ctx.rows('BossChallengeGroup')}
    rewards = defaultdict(list)
    for row in ctx.rows('BossChallengeReward'):
        rewards[row['GroupName']].append(row)
    item_rows = {row['Name']: row for row in ctx.rows('Item')}
    for row in ctx.rows('BossChallengeContents'):
        for key in (row['RewardForFirstClear'], row['RewardForRepeat']):
            for reward in rewards[key]:
                for item in reward['ItemRewards']:
                    source = item_rows[item['Item']]
                    target = ctx.items[str(value(source['ID']))]
                    if not target.get('nameVerified') and (name := ctx.text(source['Desc'])):
                        target.update({'name': name, 'nameVerified': True})
    for row in ctx.rows('BossChallengeContents'):
        entry = ctx.entries['BossChallengeContents:' + str(value(row['ID']))]
        group = groups[row['GroupName']]
        npc = npcs[row['SpawnNpc']]
        entry['activity'].update({
            'tier': group['Tier'], 'region': ctx.text(group['InfoSubTitle']),
            'bossLevel': npc['Level'], 'order': group['UIOrder'],
            'enabled': bool(row['bApply'] and group['bApply']),
        })
        entry['description'] = ctx.text(group['InfoDesc'])
        entry['subtitle'] = ctx.text(group['InfoSubTitle'])
        # These are keyed reward groups, not RewardItem/RewardPackage pools.
        entry['sections'] = [s for s in entry['sections'] if s['title'] not in REWARD_TITLES]
        for field, title in [('RewardForFirstClear', 'First-clear rewards'), ('RewardForRepeat', 'Repeat rewards')]:
            key = row[field]
            if key in ('', 'None'):
                continue
            if key not in rewards:
                raise ValueError('Missing challenge reward group: ' + key)
            rows = []
            for reward in sorted(rewards[key], key=lambda item: item['Grade']):
                links = ctx.item_links(reward['ItemRewards'])
                if len(links) != len(reward['ItemRewards']):
                    raise ValueError('Unresolved challenge reward item: ' + key)
                rows.append({'name': str(reward['Grade']), 'links': links,
                             'facts': [ctx.fact('Reward grade', reward['Grade'])]
                             + ([ctx.fact('Experience', reward['ExpReward'])] if reward['ExpReward'] else [])})
            if len(rows) == 1:
                ctx.section(entry, title, links=rows[0]['links'], facts=rows[0]['facts'])
            else:
                ctx.section(entry, title, rows=rows)

    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    periods = {value(row['ID']): row for row in ctx.rows('PeriodSpawn')}
    for entry in ctx.entries.values():
        entry.pop('worldBoss', None)
    for row in ctx.rows('WorldMapFieldNamed'):
        npc = npcs[row['FieldNamedName']]
        entry = ctx.entries.get('NpcData:' + str(value(npc['ID'])))
        if not entry:
            raise ValueError('Unpublished field boss: ' + row['FieldNamedName'])
        map_id = value(row['MapId'])
        record = {'mapId': map_id, 'region': ctx.text(maps[map_id]['Desc']),
                  'level': npc['Level'], 'spawnType': row['SpawnType'].split('::')[-1],
                  'berserkEnabled': npc['bUseBossBerserk']}
        period_id = value(row['PeriodSpawnId'])
        if period_id:
            period = periods[period_id]
            if value(period['MapId']) != map_id or period['SpawnerName'] != row['FieldNamedSpawnerName']:
                raise ValueError('Field boss schedule does not match its map/spawner')
            seconds = int(period['Time']['Ticks']) // 10_000_000
            record['schedule'] = {
                'id': 'PeriodSpawn:' + str(period_id),
                'kind': period['SpawnType'].split('::')[-1],
                'time': f'{seconds // 3600:02}:{seconds // 60 % 60:02}',
                'cycle': period['Cycle'],
                'days': [i for i, day in enumerate(('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')) if period['b' + day]],
            }
        entry.setdefault('worldBoss', []).append(record)
    return {'challenges': sum('activity' in e and e['activity']['kind'] == 'challenge' for e in ctx.entries.values()),
            'worldBosses': sum('worldBoss' in e for e in ctx.entries.values())}
