"""Dungeon entry rules, reward pools and static client schedules."""
from collections import defaultdict
from importlib import import_module
from context import human, value


def build(ctx):
    entrances = {r['Name']: r for r in ctx.rows('MapEntrance')}
    dungeon_rewards = defaultdict(list)
    for row in ctx.rows('RewardDungeon'):
        dungeon_rewards[row['Group']].append(row)
    pool = import_module('reward-pools').RewardPools(ctx).links

    def rules(entry, name):
        entrance = entrances.get(name)
        if not entrance:
            return
        ctx.section(entry, 'Entry requirements', facts=ctx.facts(entrance, {'MinLevel': 'Minimum level', 'MaxLevel': 'Maximum level', 'StartMember': 'Minimum party size', 'MaxMember': 'Maximum party size', 'EquipItemLevel': 'Equipment level', 'HighestTotalCombatValue': 'Highest combat power', 'StandardTotalCombatValue': 'Standard combat power'}))
        links = []
        for ticket in entrance['ContentsTicketList']:
            key = ticket.get('TicketName', ticket.get('Name')) if isinstance(ticket, dict) else ticket
            if link := ctx.link('ContentsTicket', key):
                links.append(link)
        ctx.section(entry, 'Entry tickets', links=links)

    cubes = {r['Name']: r for r in ctx.rows('RewardOdEnergyCube')}
    maps = {value(r['ID']): r for r in ctx.rows('Map')}
    for row in ctx.rows('Dungeon'):
        entry = ctx.entries['Dungeon:' + str(value(row['ID']))]
        rules(entry, maps.get(value(row['MapId']), {}).get('EntranceName', row['Name']))
        for field, title in [('RewardLight', 'Faction rewards: Light'), ('RewardDark', 'Faction rewards: Dark')]:
            ctx.section(entry, title, rows=[{'name': str(r['NeedPoint']), 'links': ctx.item_links(r['Items']), 'facts': [ctx.fact('Required points', r['NeedPoint'])]} for r in dungeon_rewards[row[field]]])
        cube = cubes.get(row['RewardOdEnergyCube'])
        if cube:
            ctx.section(entry, 'Reward ticket', links=[link] if (link := ctx.link('ContentsTicket', cube['TicketName'], cube['ConsumeTicketCount'])) else [])
            ctx.section(entry, 'Possible rewards', links=pool(cube['RewardCommon'], include_rates=True), showRewardRates=True)
            ctx.section(entry, 'Guaranteed rewards', facts=ctx.facts(cube, {'CeilingMaxCount': 'Guarantee threshold'}), links=ctx.item_links(cube['CeilingItems']))
        ctx.section(entry, 'Reward ticket', links=[link] if (link := ctx.link('ContentsTicket', row['RewardTicket'])) else [])
    for row in ctx.rows('BossChallengeContents'):
        entry = ctx.entries['BossChallengeContents:' + str(value(row['ID']))]
        rules(entry, row['EntranceName'])
        ctx.section(entry, 'Boss', links=[link] if (link := ctx.link('NpcData', row['SpawnNpc'])) else [])
        # Challenge rewards use BossChallengeReward, resolved by boss-catalog.
    cubes_by_group = defaultdict(list)
    for row in ctx.rows('RewardDataMonsterCube'):
        cubes_by_group[row['GroupName']].append(row)
    for row in ctx.rows('FieldEvent'):
        entry = ctx.entries['FieldEvent:' + str(value(row['ID']))]
        entry['description'] = ctx.text(row['Desc'])
        ctx.section(entry, 'Rules', text=ctx.text(row['RuleDesc']))
        ctx.section(entry, 'Possible rewards', rows=[{'name': str(r['MinLevel']) + '–' + str(r['MaxLevel']), 'links': pool(r['RewardKey']) + pool(r['RewardCommon'])} for r in cubes_by_group[row['RewardMonsterCube']]])
    weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    def clock(cell):
        seconds = int(cell['Ticks']) // 10_000_000
        return f'{seconds // 3600:02}:{seconds // 60 % 60:02}'

    for row in ctx.rows('PeriodSpawn'):
        entry = ctx.entry('PeriodSpawn', row, 'schedules', name=human(row['Name']), group=human(row['SpawnType']), fields={'Cycle': 'Cycle (unverified table units)', 'SpawnType': 'Schedule type'})
        entry['facts'].append(ctx.fact('Client schedule time (timezone unverified)', clock(row['Time'])))
        ctx.section(entry, 'Scheduled days', facts=[ctx.fact(day, row['b' + day]) for day in weekdays])
    for row in ctx.rows('EventSchedule'):
        entry = ctx.entry('EventSchedule', row, 'schedules', name=human('Event schedule') + ' ' + str(value(row['ID'])), group='Event')
        ctx.section(entry, 'Scheduled days', facts=[ctx.fact(day, row['b' + day]) for day in weekdays])
        ctx.section(entry, 'Client schedule times (timezone unverified)', text=', '.join(clock(cell) for cell in row['ActiveTimeList']))
        linked = []
        for event in row['EventList']:
            for activity in ctx.rows('FieldEvent'):
                if activity['EventGroup'] == event['Key']:
                    linked.append(ctx.link('FieldEvent', activity['ID']))
                    ctx.section(ctx.entries['FieldEvent:' + str(value(activity['ID']))], 'Schedule', links=[ctx.link('EventSchedule', row['ID'])])
        ctx.section(entry, 'Activities', links=linked)
    for row in ctx.rows('WorldMapFieldNamed'):
        npc = ctx.link('NpcData', row['FieldNamedName'])
        schedule = ctx.link('PeriodSpawn', row['PeriodSpawnId'])
        if npc and schedule:
            ctx.section(ctx.entries[npc['id']], 'Schedule', links=[schedule])
            ctx.section(ctx.entries[schedule['id']], 'Boss', links=[npc])


def sources(ctx):
    excluded_quest_sources = import_module('random-quest-sources').random_only_pairs(ctx)

    def table_ids(data):
        if isinstance(data, list):
            for row in data:
                yield from table_ids(row)
        elif isinstance(data, dict):
            for key, val in data.items():
                if key == 'TableIds':
                    yield from (value(cell) for cell in val)
                else:
                    yield from table_ids(val)

    for row in ctx.rows('ItemGetRoute'):
        item_id = str(value(row['ItemId']))
        if item_id not in ctx.items:
            continue
        links = []
        for npc_id in {value(source['NpcId']) for source in row['MonsterGetRoutes']}:
            if link := ctx.link('NpcData', npc_id):
                ctx.section(ctx.entries[link['id']], 'Possible drops', links=[ctx.link('Item', item_id)])
        for field, table, key in [('QuestGetRoutes', 'Quest', 'QuestId'), ('AchievementInfo', 'Achievement', 'TableId'), ('ConversionRecipeGetRoutes', 'ConversionRecipe', 'ConversionRecipeId')]:
            for source in row[field]:
                if table == 'Quest' and (item_id, 'Quest:' + str(value(source[key]))) in excluded_quest_sources:
                    continue
                if link := ctx.link(table, source[key], note=human(source['Class']) if source.get('Class') and not source['Class'].endswith('::None') else None):
                    links.append(link)
        for source in row['PartyDungeonGetRoutes']:
            links.extend(link for key in source['Value']['TableIds'] if (link := ctx.link('Dungeon', key, note=human(source['Key']))))
        for field, table in [('RaidInfo', 'Dungeon'), ('PeriodCollectionInfo', 'PeriodItemCollectionList'), ('DecomposeItemInfos', 'Item')]:
            links.extend(link for key in row[field] if (link := ctx.link(table, key)))
        for field in ['AwakenInfo', 'DailyInfo']:
            for source in row[field]:
                for ids in source['Value'].values():
                    if isinstance(ids, list):
                        links.extend(link for key in ids if (link := ctx.link('Dungeon', key)))
        for source in row['FieldEventInfo']:
            info = source['Value']
            for key in info['FiledBattleEvents']:
                if link := ctx.link('FieldEvent', key):
                    links.append(link)
            for activity in ctx.rows('FieldEvent'):
                if activity['Title']['Key'] in info['FiledEvents']:
                    links.append(ctx.link('FieldEvent', activity['ID']))
        for field in ['ExplorationSealInfo', 'ExplorationGarrisionInfo']:
            for key in row[field].get('TableIds', []):
                if link := ctx.link('Map', key):
                    links.append(link)
        for source in row['RankingInfo']:
            if link := ctx.link('SeasonSchedule', source['ScheduleId']):
                links.append(link)
        for box_id in set(table_ids(row['RewardBoxInfo'])):
            if link := ctx.link('Item', box_id):
                ctx.item_section(item_id, 'Available from boxes', links=[link])
                ctx.item_section(link['id'], 'Reported box rewards', links=[ctx.link('Item', item_id)])
        for source in row['MonolithInfo']:
            map_id = value(source['Key'])
            if link := ctx.link('Map', map_id):
                ctx.item_section(item_id, 'Monolith sources', links=[link])
        ctx.item_section(item_id, 'Additional acquisition sources', links=links)
    for row in ctx.rows('GameShopGoods'):
        item = ctx.link('Item', row['ItemName'])
        if item and row['bItemIsLimited']:
            ctx.item_section(item['id'], 'Shop purchase limits', rows=[{'name': human(row['LimitDurationType']), 'facts': ctx.facts(row, {'ItemLimitCount': 'Purchase limit', 'LimitDurationType': 'Reset cycle', 'LimitTargetType': 'Limit scope', 'Class': 'Class', 'ItemBundleCount': 'Bundle size'})}])
