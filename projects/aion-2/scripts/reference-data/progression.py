"""Collection, travel, season and character progression joins."""
from collections import defaultdict
from datetime import datetime, timedelta
from context import human, value


def date(cell):
    ticks = cell.get('Ticks', 0) if isinstance(cell, dict) else 0
    return (datetime(1, 1, 1) + timedelta(microseconds=ticks // 10)).isoformat(' ') if 0 < ticks < 3155378975999999999 else None


def build_ascension_rewards(ctx):
    rewards = defaultdict(lambda: defaultdict(list))
    for row in ctx.rows('AscensionReward'):
        ascension = ctx.link('Ascension', row['Ascension'])
        if not ascension:
            ctx.warnings['unpublished-ascension-reward-stages'] += 1
            continue
        links = ctx.item_links(row['ItemRewardList'])
        if links:
            rewards[ascension['id']][human(row['Race'])].append((human(row['CharacterClass']), links))
    for entry_id, factions in rewards.items():
        rows = []
        for faction, variants in factions.items():
            signatures = {tuple((link['id'], link.get('quantity')) for link in links) for _, links in variants}
            if len(signatures) == 1:
                rows.append({'name': faction, 'links': variants[0][1]})
            else:
                rows.extend({'name': faction + ' · ' + character_class, 'links': links}
                            for character_class, links in variants)
        ctx.section(ctx.entries[entry_id], 'Rewards', rows=rows)


def build(ctx):
    for table in ['Title', 'Wing', 'VehicleList']:
        for row in ctx.rows(table):
            entry = ctx.entries[table + ':' + str(value(row['ID']))]
            ctx.section(entry, 'Equipped bonuses', facts=ctx.stats(row.get('EquipStatList', [])))
            ctx.section(entry, 'Collection bonuses', facts=ctx.stats(row.get('StatList', [])))
            for field in ['ShowDate', 'StartTime', 'EndTime']:
                if timestamp := date(row.get(field)):
                    entry['facts'].append(ctx.fact(human(field) + ' (client calendar)', timestamp))
            if table == 'VehicleList':
                ctx.section(entry, 'Unlock items', links=ctx.item_links([{'Item': row['VehicleItemName']}, {'Item': row['SoulItemName'], 'Count': row['NeedSoul']}]))
                ctx.section(entry, 'Growth bonuses', rows=[{'name': str(r['Level']), 'facts': ctx.stats(r['StatList'])} for r in ctx.rows('VehicleStat') if r['Group'] == row['StatGroupName']])
            if table == 'Wing':
                costs = {r['Level']: r for r in ctx.rows('WingEnchant') if r['EnchantGroup'] == row['EnchantGroup']}
                steps = []
                for r in ctx.rows('WingEnchantEffect'):
                    if r['EffectGroup'] != row['EffectGroup']:
                        continue
                    cost = costs.get(r['Level'], {})
                    facts = ctx.stats(r['Stats'])
                    if cost:
                        facts.extend([ctx.fact('Success chance (%)', cost['BasicProb'] / 100), ctx.fact('Maximum success chance (%)', cost['MaxProb'] / 100)])
                    steps.append({'name': '+' + str(r['Level']), 'facts': facts, 'links': ctx.item_links(cost.get('CostItemList', []))})
                ctx.section(entry, 'Upgrade steps', rows=steps)
    rewards = {r['Name']: r for r in ctx.rows('RewardMonolith')}
    for row in ctx.rows('Monolith'):
        entry = ctx.entries['Monolith:' + str(value(row['ID']))]
        ctx.section(entry, 'Requirements', links=[link for table, key in [('Quest', row['SyncConditionQuest']), ('Item', row['TokenItem'])] if (link := ctx.link(table, key))])
        steps = []
        for level in ctx.rows('MonolithLevel'):
            if level['MonolithName'] != row['Name']:
                continue
            reward = rewards.get(level['Reward'], {})
            links, stats = [], []
            for r in reward.get('RewardList', []):
                links += ctx.item_links([r['Item']])
                if r['Type'].endswith('::Stat'):
                    stats += ctx.stats([r])
            steps.append({'name': str(level['Level']), 'facts': ctx.facts(level, {'NeedTokenCount': 'Required tokens', 'QuestSlotCount': 'Quest slots'}) + stats, 'links': links})
        ctx.section(entry, 'Progression rewards', rows=steps)
    for row in ctx.rows('GodstoneData'):
        entry = ctx.entries['GodstoneData:' + str(value(row['GodstoneId']))]
        entry['description'] = ctx.text(row['DescString'])
        ctx.section(entry, 'Effects', links=[link] if (link := ctx.link('SkillAbnormal', row['OptAbnormalId'])) else [])
    for row in ctx.rows('ArcanaCreate'):
        item = ctx.link('Item', row['ArcanaName'])
        entry = ctx.entry('ArcanaCreate', row, 'stones', name=item['name'] if item else human(row['ArcanaName']), group='Creation', fields={'MainStatSelectCountMax': 'Selectable primary stats', 'SubStatSelectCountMax': 'Selectable secondary stats', 'CostCurrencyValue': 'Currency cost', 'MaterialAddCountMainStat': 'Extra primary-stat materials', 'MaterialAddCountSubStat': 'Extra secondary-stat materials', 'CostCurrencyAddValueMainStat': 'Extra primary-stat currency', 'CostCurrencyAddValueSubStat': 'Extra secondary-stat currency'})
        ctx.section(entry, 'Materials', links=ctx.item_links([{'Item': row['MaterialName'], 'Count': row['MaterialCount']}]))
        ctx.section(entry, 'Result', links=[item] if item else [])
    for table, group_key, category in [('ArcanaEnchant', 'Group', 'stones'), ('SkinCollection', 'SkinCategory', 'collections')]:
        groups = defaultdict(list)
        for row in ctx.rows(table):
            groups[row[group_key]].append(row)
        for group, rows in groups.items():
            entry = ctx.entry(table, {'Name': group}, category, name=human(group), group=human(table))
            ctx.section(entry, 'Progression', rows=[{'name': str(r.get('CurrentLevel', r.get('CollectPoint'))), 'facts': ctx.facts(r, {'NeedExp': 'Required experience', 'GetExp': 'Experience gained', 'CostCurrencyValue': 'Currency cost'}) + ctx.stats(r.get('RewardStats', []))} for r in rows])
    for table in ['SeasonSchedule', 'SeasonPeriodContents']:
        for row in ctx.rows(table):
            entry = ctx.entries.get(table + ':' + str(value(row['ID']))) or ctx.entry(table, row, 'seasons', name=human(row['Group']), group='Dungeon season')
            for field in ['StartDate', 'EndDate', 'RewardStartDate', 'RewardEndDate']:
                if timestamp := date(row.get(field)):
                    entry['facts'].append(ctx.fact(human(field) + ' (client calendar)', timestamp))
    groups = defaultdict(list)
    for row in ctx.rows('PeriodItemCollectionList'):
        groups[row['GroupName']].append(row)
        entry = ctx.entry('PeriodItemCollectionList', row, 'collections', group='Collection objective', fields={'TargetCount': 'Required count', 'RewardExp': 'Experience reward'}, description=ctx.text(row['Desc']))
        required_items = ctx.item_links(row['TargetItems'])
        for item in required_items:
            if item.get('quantity') == 0:
                if row['TargetCount'] > 0:
                    item['quantity'] = row['TargetCount']
                else:
                    item.pop('quantity')
        ctx.section(entry, 'Required items', links=required_items)
        ctx.section(entry, 'Rewards', links=ctx.item_links(row['RewardItems']))
    for row in ctx.rows('PeriodItemCollection'):
        entry = ctx.entries['PeriodItemCollection:' + str(value(row['ID']))]
        ctx.section(entry, 'Collection objectives', links=[ctx.link('PeriodItemCollectionList', r['ID']) for r in groups[row['GroupName']]])
    for table, fields in [('ContentsUnlock', ['UnlockQuestNameLight', 'UnlockQuestNameDark']), ('Ascension', ['ClearQuestLight', 'ClearQuestDark'])]:
        for row in ctx.rows(table):
            identity = value(row.get('ID', row.get('DataId')))
            entry = ctx.entries[table + ':' + str(identity)]
            ctx.section(entry, 'Required quests', links=[link for key in fields if (link := ctx.link('Quest', row[key]))])
    build_ascension_rewards(ctx)
    for row in ctx.rows('ContentsTicket'):
        entry = ctx.entries['ContentsTicket:' + str(value(row['ID']))]
        entry['description'] = ctx.text(row['InfoDesc'])
        ctx.section(entry, 'Subscription recharge', facts=ctx.facts(row, {k: human(k.removeprefix('Subscribe')) for k in row if k.startswith('Subscribe') and k != 'SubscribeType'}))
    teleports = {r['Name']: r for r in ctx.rows('Teleport')}
    for table, field in [('TeleportArtifact', 'Teleport'), ('NpcTeleport', 'TeleportName')]:
        for row in ctx.rows(table):
            entry = ctx.entries[table + ':' + str(value(row['ID']))]
            ctx.section(entry, 'Travel cost', links=ctx.item_links([{'Item': row.get('TeleportCostItemName', row.get('CostItemName')), 'Count': row.get('TeleportCostItemCount', row.get('Cost'))}]))
            ctx.section(entry, 'Unlock quest', links=[link] if (link := ctx.link('Quest', row.get('Quest'))) else [])
            destination = teleports.get(row[field])
            if destination:
                entry['destination'] = {'mapId': value(destination['MapId']), 'actor': destination['ActorName']}
