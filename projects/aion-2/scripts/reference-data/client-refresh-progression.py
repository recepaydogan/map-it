"""Refresh explicitly scoped progression records using the shared reference schema."""
from collections import defaultdict
import hashlib
import importlib
import json
from context import human, value, write


def build(ctx, scope, entry, refresh_item, touched_items):
    def replace(record, title, **content):
        record['sections'] = [s for s in record['sections'] if s['title'] != ctx.label(title)]
        ctx.section(record, title, **content)

    # Rebuild complete upgrade groups, never infer unnamed transfer parameters.
    for table in ['ExceedEnchant', 'ItemSuccession']:
        groups = defaultdict(list)
        for row in ctx.rows(table):
            if row['Group'] in scope.get('upgradeGroups', {}).get(table, []):
                groups[row['Group']].append(row)
        for group, rows in groups.items():
            record = entry(table, {'Name': group}, 'enhancements', key=group, group=human(table))
            steps = []
            for row in rows:
                facts = ctx.facts(row, {'CostGold': 'Currency cost', 'FailPenalty': 'Failure penalty'})
                for key, label in [('SuccessProb', 'Success chance (%)'), ('FailCorrectionProb', 'Failure correction (%)')]:
                    if key in row:
                        facts.append(ctx.fact(label, row[key] / 100))
                costs = ctx.item_links(row.get('CostItems', row.get('CostItem', [])))
                # Transfer source/target levels remain unnamed in this mapping.
                # Costs are exact; no level semantics are assigned to unknown columns.
                steps.append({'name': '+' + str(row['CurrentLevel']) if 'CurrentLevel' in row else str(len(steps) + 1),
                              'facts': facts, 'links': costs})
            ctx.section(record, 'Upgrade steps', rows=steps)
    native_items = {str(value(r['ID'])): r for r in ctx.rows('Item')}
    item_chunks = {}
    for item_id in scope['itemIds']:
        row = native_items[item_id]
        if row['ItemType'] != 'EItemType::Equip':
            continue
        bucket = item_id[:3]
        if bucket not in item_chunks:
            path = ctx.public / 'data/reference/items' / (bucket + '.json')
            item_chunks[bucket] = json.loads(path.read_text('utf8'))['items'] if path.exists() else {}
        previous = item_chunks[bucket].get(item_id, [])
        links = [link for section in previous if section['title'] == ctx.label('Upgrades and sets')
                 for link in section.get('links', []) if not link['id'].startswith(('ExceedEnchant:', 'ItemSuccession:'))]
        for field, table in [('ExceedEnchantGroup', 'ExceedEnchant'), ('SuccessionGroup', 'ItemSuccession')]:
            if row.get(field) not in (None, '', 'None'):
                link = ctx.link(table, row[field])
                if link:
                    links.append(link)
        ctx.item_sections[item_id] = [s for s in ctx.item_sections[item_id] if s['title'] != ctx.label('Upgrades and sets')]
        ctx.item_section(item_id, 'Upgrades and sets', links=links)

    skill_rows = {value(r['ID']): r for r in ctx.rows('Skill')}
    skill_strings = {r['Name']: r for r in ctx.rows('SkillString')}
    for skill_id in scope.get('skillIds', []):
        record = ctx.entries.get('Skill:' + str(skill_id))
        if not record:
            continue
        row = skill_rows[skill_id]
        record['facts'] = [f for f in record['facts'] if f['label'] != ctx.label('Cooldown (table units)')]
        record['facts'].append(ctx.fact('Cooldown (table units)', row['NeedCoolTime']))
        entry_id = record['id']
        # Keep the original skill sections while registering the dirty identity.
        entry('Skill', row, record['category'], name=record['name'])
        ctx.entries[entry_id] = record
        texts = skill_strings[row['SkillString_Key']]
        record['description'] = ctx.text(texts.get('SkillSpecDesc')) or ctx.text(texts.get('SkillDescEffect'))
    abnormal_rows = {value(r['ID']): r for r in ctx.rows('SkillAbnormal')}
    effects = defaultdict(list)
    for row in ctx.rows('SkillAbnormalEffect'):
        effects[value(row['AbnormalId'])].append(row)
    levels = defaultdict(list)
    for row in ctx.rows('SkillAbnormalEffectLv'):
        levels[row['AbnormalEffectLevelGroupId']].append(row)
    for abnormal_id in scope.get('abnormalIds', []):
        old = ctx.entries.get('SkillAbnormal:' + str(abnormal_id))
        if not old:
            raise ValueError('Missing scoped effect: ' + str(abnormal_id))
        row = abnormal_rows[abnormal_id]
        record = entry('SkillAbnormal', row, 'effects', name=old['name'], description=old.get('description'), group=old.get('group'))
        ctx.section(record, 'Effects', rows=[{'name': human(r['AbnormalEffectType']), 'facts': [ctx.fact('Effect parameters (table order)', ', '.join(r['Values']))]} for r in effects[abnormal_id]])
        for effect in effects[abnormal_id]:
            group = effect['AbnormalEffectLvGroupId']
            if group == 'None' or effect['AbnormalEffectType'] != 'EAbnormalEffectType::StatChange' or effect['Values'][0] != 'HPMax':
                continue
            hp_rows = [(1, effect['Values'])] + [(r['AbnormalEffectLevel'], r['Values']) for r in levels[group]]
            ctx.section(record, 'Skill levels', rows=[{'name': str(level),
                        'facts': ctx.stats([{'StatType': values[0], 'StatValue': float(values[1])}])} for level, values in hp_rows])

    # Native class rows have a known stat map; omit unreleased classes via scope.
    class_rows = defaultdict(list)
    for row in ctx.rows('PcStatLevel'):
        if row['Class'] in scope.get('classes', []):
            class_rows[row['Class']].append(row)
    for cls, rows in class_rows.items():
        record = entry('PcStatLevel', {'Name': cls}, 'progression', key=cls, name=human(cls), group=human('ClassStats'))
        ctx.section(record, 'Progression', rows=[{'name': str(r['Level']), 'facts': ctx.stats([{'StatType': s['Key'], 'StatValue': s['Value']} for s in r['StatList']])} for r in rows])
    for row in ctx.rows('ContentsUnlock'):
        if value(row['ID']) in scope.get('unlockIds', []):
            record = ctx.entries['ContentsUnlock:' + str(value(row['ID']))]
            record['facts'] = ctx.facts(row, {'UnlockLevel': 'Required level', 'UnlockAscensionGrade': 'Required ascension', 'UnlockEquipItemLevel': 'Required equipment level'})
            old = record
            entry('ContentsUnlock', row, record['category'], name=record['name'])
            ctx.entries[old['id']] = old

    for row in ctx.rows('MapEntrance'):
        if value(row['ID']) in scope.get('entranceIds', []):
            map_row = next(r for r in ctx.rows('Map') if r.get('EntranceName') == row['Name'])
            entry('MapEntrance', row, 'progression', name=ctx.text(map_row['Desc']),
                  fields={'MaxMember': 'Maximum players', 'MinLevel': 'Minimum level'})

    for row in ctx.rows('NpcData'):
        if value(row['ID']) not in scope.get('bossIds', []):
            continue
        record = ctx.entries['NpcData:' + str(value(row['ID']))]
        record['facts'] = [f for f in record['facts'] if f['label'] != ctx.label('Berserk time (table units)')]
        record['facts'].append(ctx.fact('Berserk time (table units)', row['BossBerserkInvokeTime']))
        entry('NpcData', row, 'creatures', name=record['name'])
        ctx.entries[record['id']] = record

    maps = {value(r['ID']): r for r in ctx.rows('Map')}
    entrances = {r['Name']: r for r in ctx.rows('MapEntrance')}
    rewards = defaultdict(list)
    for row in ctx.rows('RewardDungeon'):
        rewards[row['Group']].append(row)
    for row in ctx.rows('Dungeon'):
        if value(row['ID']) not in scope.get('dailyDungeonIds', []):
            continue
        old = ctx.entries['Dungeon:' + str(value(row['ID']))]
        entry('Dungeon', row, old['category'], name=old['name'])
        ctx.entries[old['id']] = old
        entrance = entrances[maps[value(row['MapId'])]['EntranceName']]
        old['adventure']['level'] = entrance['MinLevel']
        replace(old, 'Entry requirements', facts=ctx.facts(entrance, {'MinLevel': 'Minimum level', 'MaxMember': 'Maximum party size'}))
        for field, title in [('RewardLight', 'Faction rewards: Light'), ('RewardDark', 'Faction rewards: Dark')]:
            replace(old, title, rows=[{'name': str(r['NeedPoint']), 'facts': [ctx.fact('Required points', r['NeedPoint'])], 'links': ctx.item_links(r['Items'])} for r in rewards[row[field]]])

    pass_groups = {r['Name']: r for r in ctx.rows('BattlePassGroup')}
    achievement_rows = {value(r['AchievementId']): r for r in ctx.rows('Achievement')}
    for table, category in [('Wing', 'wings'), ('VehicleList', 'mounts'), ('Skin', 'collections'), ('SkinSet', 'collections'), ('Attendance', 'seasons'), ('BattlePass', 'seasons')]:
        selected = set(scope.get('recordIds', {}).get(table, []))
        for row in ctx.rows(table):
            if value(row['ID']) not in selected:
                continue
            title = ctx.text(row.get('DescLight')) or ctx.text(row.get('ListTitle')) or ctx.text(row.get('Title')) or ctx.text(row.get('Desc'))
            if not title:
                raise ValueError('Missing current localized title: ' + table + ':' + str(value(row['ID'])))
            if table == 'BattlePass':
                title = ctx.text(pass_groups[row['GroupName']]['Title']) + ' · ' + title
            record = entry(table, row, category, name=title, group=human(table), fields={'AttendanceMaxDays': 'Days', 'UnlockLevel': 'Required level', 'UnlockCostCount': 'Currency cost'})
            if table in ['Attendance', 'BattlePass']:
                key = row['AchievementId'] if table == 'Attendance' else row['ExpAchievementId']
                achievement = ctx.entries['Achievement:' + str(value(key))]
                achievement['name'] = title
                entry('Achievement', achievement_rows[value(key)], 'achievements', name=title)
                ctx.entries[achievement['id']] = achievement
                ctx.section(record, 'Progression', links=[ctx.link('Achievement', key)])
                ctx.section(record, 'Rewards', links=ctx.item_links(row.get('ItemReward', [])))
            if table in ['Wing', 'VehicleList']:
                ctx.section(record, 'Equipped bonuses', facts=ctx.stats(row.get('EquipStatList', [])))
                ctx.section(record, 'Collection bonuses', facts=ctx.stats(row.get('StatList', [])))
            if table == 'VehicleList':
                ctx.section(record, 'Unlock items', links=ctx.item_links([{'Item': row['VehicleItemName']}]))
            if table == 'Wing':
                ctx.section(record, 'Upgrade steps', rows=[{'name': '+' + str(r['Level']), 'facts': ctx.stats(r['Stats'])} for r in ctx.rows('WingEnchantEffect') if r['EffectGroup'] == row['EffectGroup']])
    targets = {'EItemUseEffect::GetWing': 'Wing', 'EItemUseEffect::GetVehicle': 'VehicleList', 'EItemUseEffect::GetVehicleSoul': 'VehicleList'}
    for item_id in list(touched_items):
        row = native_items[item_id]
        if row.get('UseEffect') in targets:
            table = targets[row['UseEffect']]
            ctx.item_section(item_id, 'Use effect', links=[ctx.link(table, row['UseEffectValues'][0])])

    # The skill view can prefer its resolved description cache over the entry.
    selected_skills = {'Skill:' + str(key) for key in scope.get('skillIds', [])}
    damage_records = importlib.import_module('skill-damage').collect(ctx, selected_skills)
    for identity in selected_skills:
        path = ctx.public / 'data/reference/skill-damage' / (hashlib.sha256(identity.encode()).hexdigest()[:2] + '.json')
        chunk = json.loads(path.read_text('utf8'))
        if identity in damage_records:
            chunk['skills'][identity] = damage_records[identity]
        else:
            chunk['skills'].pop(identity, None)
        if json.loads(path.read_text('utf8')) != chunk:
            write(path, chunk)
