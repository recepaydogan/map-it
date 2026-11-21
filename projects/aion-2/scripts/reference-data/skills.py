"""Named skills, learned levels, effects, specializations and board nodes."""
from collections import defaultdict
from context import human, value


def effect_links(ctx, effect):
    """Only designated abnormal IDs are references; durations and chances are not."""
    positions = {'ESkillEffectType::Abnormal': 2, 'ESkillEffectType::Abnormal_True': 2,
                 'ESkillEffectType::Abnormal_Cc': 2, 'ESkillEffectType::Abnormal_Passive': 0}
    position = positions.get(effect['EffectType'])
    values = effect.get('EffectValueList', [])
    if position is None or position >= len(values):
        return []
    link = ctx.link('SkillAbnormal', values[position])
    return [link] if link else []


def build(ctx):
    strings = {r['Name']: r for r in ctx.rows('SkillAbnormalString')}
    effects = defaultdict(list)
    for row in ctx.rows('SkillAbnormalEffect'):
        effects[value(row['AbnormalId'])].append(row)
    for row in ctx.rows('SkillAbnormal'):
        texts = strings.get(row['SkillAbnormalString_Key'], {})
        title = ctx.text(texts.get('DescName'))
        if not title:
            continue
        entry = ctx.entry('SkillAbnormal', row, 'effects', name=title, description=ctx.text(texts.get('DescSummary')) or ctx.text(texts.get('DescEffect')), fields={'AbnormalOverlapCount': 'Maximum stacks', 'AbnormalEffectType': 'Effect type'}, group=human(row.get('AbnormalEffectType', 'Effect')))
        ctx.section(entry, 'Effects', rows=[{'name': human(r['AbnormalEffectType']), 'facts': [ctx.fact('Effect parameters (table order)', ', '.join(map(str, r['Values'])))]} for r in effects[value(row['ID'])]])
    acquire, levels, special, effect_groups = (defaultdict(list) for _ in range(4))
    for row in ctx.rows('SkillAcquireData'):
        acquire[value(row['SkillId'])].append(row)
    for row in ctx.rows('SkillLv'):
        levels[row['SkillLvGroupId']].append(row)
    for row in ctx.rows('SpecializedSkill'):
        special[value(row['ParentSkillId'])].append(row)
    for row in ctx.rows('SkillEffect'):
        effect_groups[value(row['SkillEffectGroupId'])].append(row)
    for row in ctx.rows('Skill'):
        sid = value(row['ID'])
        entry = ctx.entries.get('Skill:' + str(sid))
        if not entry:
            continue
        learn = []
        for r in acquire[sid]:
            links = ctx.item_links(r.get('CostItemDataList', []))
            for previous in r.get('NeedPrevSkillDataList', []):
                link = ctx.link('Skill', previous.get('SkillId'))
                if link:
                    links.append(link)
            learn.append({'name': human(r['ClassType']) + ' · ' + str(r['SkillLevel']), 'facts': ctx.facts(r, {'NeedCharacterLevel': 'Required level', 'NeedAscensionGrade': 'Required ascension', 'AcquireType': 'Unlock method', 'CostSkillPoint': 'Skill points', 'CostStigmaPoint': 'Stigma points', 'CostStigmaSuperiorPoint': 'Superior stigma points', 'bAutoLearn': 'Automatically learned'}), 'links': links})
        ctx.section(entry, 'Learning requirements', rows=learn)
        ctx.section(entry, 'Skill levels', rows=[{'name': str(r['SkillLv']), 'facts': ctx.facts(r, {'NeedCoolTime': 'Cooldown (table units)', 'NeedCostMp': 'MP cost', 'NeedCostHp': 'HP cost', 'CastingTime': 'Casting time (table units)'})} for r in levels[row['SkillLvGroupId']]])
        ctx.section(entry, 'Specializations', links=[link for r in special[sid] if (link := ctx.link('Skill', r['ChildSkillId']))])
        rows = []
        for event in row['SkillEffectTimeDataList']:
            for effect in effect_groups[value(event['SkillEffectGroupId'])]:
                links = effect_links(ctx, effect)
                rows.append({'name': human(effect['EffectType']), 'links': links, 'facts': [ctx.fact('Effect parameters (table order)', ', '.join(map(str, effect.get('EffectValueList', []))))]})
        ctx.section(entry, 'Effects', rows=rows)
    nodes = defaultdict(list)
    for row in ctx.rows('DaevanionNode'):
        if row['Type'].endswith('::None'):
            continue
        node = {'id': str(value(row['ID'])), 'row': row['Row'], 'column': row['Col'], 'name': ctx.text(row['Title'], human(row['Type'])), 'cost': row['CostDaevanionPoint'], 'level': row['NeedLevel'], 'grade': human(row['Grade']), 'automatic': row['bAutoLearn']}
        facts = ctx.facts(row, {'NeedConditionType': 'Condition', 'NeedConditionValue': 'Condition value', 'ResetGold': 'Reset currency cost'})
        if row['Type'].endswith('::Stat'):
            node['bonuses'] = ctx.stats([{'StatType': row[f'Value{i:02}'], 'StatValue': float(row[f'Value{i + 1:02}'])} for i in range(1, 10, 2) if row[f'Value{i:02}'] and row[f'Value{i + 1:02}']])
            facts += node['bonuses']
        links = []
        for i in range(1, 11):
            val = row.get(f'Value{i:02}')
            for table in ['Skill', 'SkillAbnormal']:
                if (table, str(val).casefold()) in ctx.aliases:
                    links.append(ctx.link(table, val))
        node['facts'] = facts
        node['links'] = links
        nodes[value(row['Board'])].append(node)
    for row in ctx.rows('DaevanionBoard'):
        ctx.entries['DaevanionBoard:' + str(value(row['ID']))]['board'] = nodes[value(row['ID'])]
    capacity = ctx.entry('DaevanionMaxCapacity', {'Name': 'capacity'}, 'boards', name='Board capacity', group='Capacity')
    ctx.section(capacity, 'Capacity', rows=[{'name': str(i + 1), 'facts': ctx.facts(r, {k: human(k) for k in r if k != 'ID'})} for i, r in enumerate(ctx.rows('DaevanionMaxCapacity'))])
    for row in ctx.rows('NpcData'):
        entry = ctx.entries.get('NpcData:' + str(value(row['ID'])))
        if entry:
            ctx.section(entry, 'Skills', links=[link for skill in row['ActiveSkillList'] if (link := ctx.link('Skill', skill))])
