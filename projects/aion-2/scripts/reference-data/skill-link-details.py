"""Give same-named creature skills useful, non-invented distinguishing details."""
from collections import defaultdict
from context import human, value


def build(ctx):
    skills = {str(value(row['ID'])): row for row in ctx.rows('Skill')}
    strings = {row['Name']: row for row in ctx.rows('SkillString')}
    effects = defaultdict(set)
    for row in ctx.rows('SkillEffect'):
        effects[value(row['SkillEffectGroupId'])].add(human(row['EffectType']))
    for entry in ctx.entries.values():
        for section in entry['sections']:
            if section['title'] != 'reference.labels.skills':
                continue
            for link in section.get('links', []):
                skill = skills.get(link['id'].removeprefix('Skill:'))
                if not skill:
                    continue
                text = strings.get(skill['SkillString_Key'], {})
                description = ctx.text(text.get('SkillSpecDesc')) or ctx.text(text.get('SkillDescEffect'))
                if description and description.casefold() != link['name'].casefold():
                    link['note'] = description
                details = ctx.facts(skill, {'SkillDamageType': 'Damage type', 'TargetProcessType': 'Target type'})
                effect_types = sorted({kind for event in skill['SkillEffectTimeDataList']
                                       for kind in effects[value(event['SkillEffectGroupId'])] if kind != 'None'})
                if effect_types:
                    details.append(ctx.fact('Effects', ', '.join(effect_types)))
                link['skillDetails'] = details
