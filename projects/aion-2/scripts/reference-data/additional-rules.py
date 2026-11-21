"""Supporting progression rules that do not own a primary category."""
from collections import defaultdict
from context import human, value


def build(ctx):
    for row in ctx.rows('GatherSkill'):
        ctx.entry('GatherSkill', row, 'gathering', name=ctx.text(row['SkillDesc'], human(row['Name'])), description=ctx.text(row['LongDesc']), group=human(row['SkillCategory']), fields={'ConditionType': 'Activation condition'})
    groups = defaultdict(list)
    for row in ctx.rows('ItemSuccessionProb'):
        groups[row['Type']].append(row)
    for group, rows in groups.items():
        entry = ctx.entry('ItemSuccessionProb', {'Name': group}, 'enhancements', group='Transfer chance')
        ctx.section(entry, 'Success rates', rows=[{'name': str(r['SuccessionCount']), 'facts': [ctx.fact('Transfers', r['SuccessionCount']), ctx.fact('Success chance (%)', r['SuccessProb'] / 100)]} for r in rows])
    for row in ctx.rows('RewardLimit'):
        entry = ctx.entry('RewardLimit', row, 'tickets', name=human(row['RewardLimitType']), group='Reward limits', fields={'CycleType': 'Reset cycle', 'MaxAmount': 'Maximum rewards', 'ResetDay': 'Reset weekday (client index)'})
        seconds = row['ResetTime']['Ticks'] // 10_000_000
        entry['facts'].append(ctx.fact('Client reset time (timezone unverified)', f'{seconds // 3600:02}:{seconds // 60 % 60:02}'))
    for row in ctx.rows('SeasonRankingRewardItem'):
        entry = ctx.entry('SeasonRankingRewardItem', row, 'seasons', group='Ranking reward pool')
        ctx.section(entry, 'Rewards', links=ctx.item_links(row['Items']))
    levels = defaultdict(list)
    for row in ctx.rows('SkillEffectLv'):
        levels[row['SkillEffectLvGroupId']].append(row)
    effects = defaultdict(list)
    for row in ctx.rows('SkillEffect'):
        effects[value(row['SkillEffectGroupId'])].append(row)
    for row in ctx.rows('Skill'):
        entry = ctx.entries.get('Skill:' + str(value(row['ID'])))
        if not entry:
            continue
        level_rows = []
        for timing in row['SkillEffectTimeDataList']:
            for effect in effects[value(timing['SkillEffectGroupId'])]:
                for level in levels[effect['SkillEffectLvGroupId']]:
                    level_rows.append({'name': human(effect['EffectType']) + ' · ' + str(level['SkillEffectLv']), 'facts': [ctx.fact('Effect parameters (table order)', ', '.join(map(str, level['EffectValueList'])))]})
        ctx.section(entry, 'Effect levels', rows=level_rows)
    for row in ctx.rows('Item'):
        item_id = str(value(row['ID']))
        for effect_value in row.get('UseEffectValues', []):
            for table in ['BoxReward', 'BoxClassReward']:
                if 'Box' in row.get('UseEffect', ''):
                    for index, box in enumerate(ctx.rows(table)):
                        if box['Group'] == effect_value:
                            entry = ctx.entries[table + ':' + str(index)]
                            ctx.item_section(item_id, 'Box contents', links=[{'id': entry['id'], 'category': 'boxes', 'name': entry['name']}])
            for table in ['Title', 'VehicleList', 'Wing']:
                if (table, str(effect_value).casefold()) in ctx.aliases:
                    link = ctx.link(table, effect_value)
                    ctx.section(ctx.entries[link['id']], 'Unlock items', links=[ctx.link('Item', item_id)])
