"""Publish level-specific damage parameters referenced by native skill text."""
import hashlib
import re
from collections import defaultdict

from context import value, write


DAMAGE_TOKEN = re.compile(r'\{se_dmg:(\d+):SkillUI(?:Min|Max)Dmg(?:Sum)?\}', re.I)
DAMAGE_RANGE = re.compile(
    r'\{se_dmg:(\d+):SkillUIMinDmg(?:Sum)?\}-'
    r'\{se_dmg:(\d+):SkillUIMaxDmg(?:Sum)?\}', re.I)
DAMAGE_ANY_RANGE = re.compile(
    r'\{(?:se_dmg|se_abe_dmg):[^{}]+?\}-'
    r'\{(?:se_dmg|se_abe_dmg):[^{}]+?\}', re.I)
DAMAGE_FOLLOWS = re.compile(r'^\s*(?:</>)?\s+(?:\w+\s+)?damage\b', re.I)
PLACEHOLDER = re.compile(r'…\s*[-–]\s*…(?=\s+(?:\w+\s+)?damage\b)', re.I)
HEAL_TOKEN = re.compile(r'\{se_dmg:(\d+):SkillUIHPHeal(?:Min|Max)(?::total)?\}', re.I)


def damage_values(values):
    if len(values) < 4:
        return None
    try:
        numbers = [int(values[index]) for index in range(4)]
    except (TypeError, ValueError):
        return None
    return numbers if all(number >= 0 for number in numbers) else None


def healing_values(values):
    if len(values) < 2:
        return None
    try:
        numbers = [int(values[index]) for index in range(2)]
    except (TypeError, ValueError):
        return None
    return numbers if all(number >= 0 for number in numbers) else None


def collect(ctx, skill_ids=None):
    strings = {row['Name']: row for row in ctx.rows('SkillString')}
    effects = {str(value(row['ID'])): row for row in ctx.rows('SkillEffect')}
    levels = defaultdict(list)
    for row in ctx.rows('SkillEffectLv'):
        levels[row['SkillEffectLvGroupId']].append(row)

    result = {}
    for skill in ctx.rows('Skill'):
        if skill_ids is not None and 'Skill:' + str(value(skill['ID'])) not in skill_ids:
            continue
        text = strings.get(skill['SkillString_Key'], {})
        descriptions = [text.get('SkillDescEffect'), text.get('SkillSpecDesc')]
        raw = [ctx.raw_text(key) for key in descriptions]
        effect_ids = list(dict.fromkeys(match.group(1) for source in raw
                                        for match in DAMAGE_TOKEN.finditer(source)))
        healing_ids = list(dict.fromkeys(match.group(1) for source in raw
                                         for match in HEAL_TOKEN.finditer(source)))
        damage = []
        for effect_id in effect_ids:
            effect = effects.get(effect_id)
            if not effect or effect['EffectType'] != 'ESkillEffectType::Damage':
                continue
            base = damage_values(effect.get('EffectValueList', []))
            if base is None:
                continue
            by_level = {1: [1, *base]}
            for row in levels[effect['SkillEffectLvGroupId']]:
                numbers = damage_values(row.get('EffectValueList', []))
                level = row['SkillEffectLv']
                if numbers is not None and isinstance(level, int) and level > 1:
                    by_level[level] = [level, *numbers]
            damage.append({'id': effect_id, 'levels': [by_level[level] for level in sorted(by_level)]})
        healing = []
        for effect_id in healing_ids:
            effect = effects.get(effect_id)
            if not effect or effect['EffectType'] != 'ESkillEffectType::HpHeal':
                continue
            base = healing_values(effect.get('EffectValueList', []))
            if base is None:
                continue
            by_level = {1: [1, *base]}
            for row in levels[effect['SkillEffectLvGroupId']]:
                numbers = healing_values(row.get('EffectValueList', []))
                level = row['SkillEffectLv']
                if numbers is not None and isinstance(level, int) and level > 1:
                    by_level[level] = [level, *numbers]
            healing.append({'id': effect_id, 'levels': [by_level[level] for level in sorted(by_level)]})
        if not damage and not healing:
            continue
        description = ctx.text(descriptions[0])
        spec = ctx.text(descriptions[1])
        record = {'effects': damage}
        damage_ranges = []
        for match in DAMAGE_ANY_RANGE.finditer(raw[0] or ''):
            if DAMAGE_FOLLOWS.match((raw[0] or '')[match.end():]):
                direct = DAMAGE_RANGE.fullmatch(match.group())
                damage_ranges.append(list(direct.groups()) if direct else None)
        if healing:
            record['healing'] = healing
        if description:
            record['description'] = description
        effect_ids = {effect['id'] for effect in damage}
        if (any(damage_ranges) and len(damage_ranges) == len(PLACEHOLDER.findall(description or ''))
                and all(pair is None or (pair[0] in effect_ids and pair[1] in effect_ids)
                        for pair in damage_ranges)):
            record['damageRanges'] = damage_ranges
        if spec and spec != description:
            record['spec'] = spec
        result['Skill:' + str(value(skill['ID']))] = record
    known = {(record.get('description'), tuple(effect['id'] for effect in record['effects'])):
             record['damageRanges'] for record in result.values() if record.get('damageRanges')}
    for record in result.values():
        key = (record.get('description'), tuple(effect['id'] for effect in record['effects']))
        if 'damageRanges' not in record and key in known:
            record['damageRanges'] = known[key]
    return result


def publish(ctx):
    records = collect(ctx)
    chunks = defaultdict(dict)
    for skill_id, record in records.items():
        chunk = hashlib.sha256(skill_id.encode()).hexdigest()[:2]
        chunks[chunk][skill_id] = record
    destination = ctx.public / 'data/reference/skill-damage'
    for chunk in (f'{number:02x}' for number in range(256)):
        write(destination / (chunk + '.json'), {'version': 1, 'skills': chunks[chunk]})
    return len(records)
