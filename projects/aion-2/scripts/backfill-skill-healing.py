"""Recover published HP-heal level ranges when decoded client tables are unavailable."""
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write


ROOT = Path(__file__).resolve().parents[1] / 'public' / 'data'
SKILLS = ROOT / 'reference' / 'skills'
VALUES = ROOT / 'reference' / 'skill-damage'
TOKEN = re.compile(r'\{se_dmg:(\d+):SkillUIHPHeal(Min|Max)(?::total)?\}', re.I)
SKILL_KEY = re.compile(r'_(\d+)_skill_desc_effect$', re.I)
LEVEL_ROW = re.compile(r'^Hp Heal · (\d+)$')


def chunk(identity):
    return hashlib.sha256(identity.encode()).hexdigest()[:2] + '.json'


def read(path):
    return json.loads(path.read_text('utf8'))


def pair(value):
    parts = value.split(', ')
    if len(parts) < 2:
        return None
    try:
        result = [int(parts[0]), int(parts[1])]
    except ValueError:
        return None
    return result if all(number >= 0 for number in result) else None


source = read(ROOT / 'game-locales' / 'source.json')
linked = defaultdict(lambda: defaultdict(set))
for key, text in zip(source['keys'], source['values']):
    match = SKILL_KEY.search(key)
    if not match or not isinstance(text, str):
        continue
    for effect_id, kind in TOKEN.findall(text):
        linked[match[1]][effect_id].add(kind.lower())

skill_chunks = {}
value_chunks = {}
changed_files = set()
published = 0
for skill_id, effect_ids in linked.items():
    identity = 'Skill:' + skill_id
    skill_file = SKILLS / chunk(identity)
    skill_chunk = skill_chunks.setdefault(skill_file, read(skill_file))
    if identity not in skill_chunk['entries']:
        continue
    healing = []
    for effect_id, kinds in effect_ids.items():
        if kinds != {'min', 'max'}:
            continue
        owner_id = 'Skill:' + effect_id[:-2]
        owner_file = SKILLS / chunk(owner_id)
        owner_chunk = skill_chunks.setdefault(owner_file, read(owner_file))
        owner = owner_chunk['entries'].get(owner_id)
        if owner is None:
            continue
        sections = {section['title']: section for section in owner.get('sections', [])}
        effects = sections.get('reference.labels.effects', {}).get('rows', [])
        heal_effects = [row for row in effects if row['name'] == 'Hp Heal']
        if not heal_effects:
            continue
        # A single healing effect is unambiguous. Native suffix 11 identifies
        # the first effect when the skill has two ordered HP-heal effects.
        if len(heal_effects) == 1:
            chosen = 0
        elif effect_id.endswith('11') and effects[0]['name'] == 'Hp Heal':
            chosen = 0
        else:
            continue
        base = pair(heal_effects[chosen]['facts'][0]['value'])
        if base is None:
            continue
        groups = []
        for row in sections.get('reference.labels.effect-levels', {}).get('rows', []):
            match = LEVEL_ROW.match(row['name'])
            if not match:
                continue
            level = int(match[1])
            numbers = pair(row['facts'][0]['value'])
            if numbers is None:
                continue
            if not groups or level <= groups[-1][-1][0]:
                groups.append([])
            groups[-1].append([level, *numbers])
        if groups and len(groups) != len(heal_effects):
            continue
        levels = [[1, *base], *(groups[chosen] if groups else [])]
        healing.append({'id': effect_id, 'levels': levels})
    if not healing:
        continue
    values_file = VALUES / chunk(identity)
    value_chunk = value_chunks.setdefault(values_file, read(values_file))
    record = value_chunk['skills'].setdefault(identity, {'effects': []})
    record['healing'] = healing
    changed_files.add(values_file)
    published += 1

known = {}
for file, data in value_chunks.items():
    known.update({identity: record['healing'] for identity, record in data['skills'].items() if record.get('healing')})

entries = {}
for file in SKILLS.glob('*.json'):
    data = skill_chunks.setdefault(file, read(file))
    entries.update({identity: entry for identity, entry in data['entries'].items()
                    if re.search(r'…\s*[-–]\s*…\s+HP\b', entry.get('description') or '')})

for identity, entry in entries.items():
    if identity in known:
        continue
    sections = {section['title']: section for section in entry.get('sections', [])}
    effects = [row for row in sections.get('reference.labels.effects', {}).get('rows', []) if row['name'] == 'Hp Heal']
    groups = []
    for row in sections.get('reference.labels.effect-levels', {}).get('rows', []):
        match = LEVEL_ROW.match(row['name'])
        if not match or (numbers := pair(row['facts'][0]['value'])) is None:
            continue
        level = int(match[1])
        if not groups or level <= groups[-1][-1][0]:
            groups.append([])
        groups[-1].append([level, *numbers])
    if not effects or (groups and len(groups) != len(effects)):
        continue
    own_levels = [[[1, *pair(effect['facts'][0]['value'])], *(groups[index] if groups else [])]
                  for index, effect in enumerate(effects) if pair(effect['facts'][0]['value']) is not None]
    candidates = [(other_healing[0]['id'], levels) for other_id, other_healing in known.items()
                  if other_id != identity and entries.get(other_id, {}).get('name') == entry['name']
                  and entries[other_id].get('description') == entry.get('description')
                  for levels in own_levels if len(other_healing) == 1 and other_healing[0]['levels'] == levels]
    if len(own_levels) == 1:
        effect_id, levels = candidates[0] if candidates else (identity + ':HpHeal', own_levels[0])
    elif len({(effect_id, tuple(map(tuple, levels))) for effect_id, levels in candidates}) == 1:
        effect_id, levels = candidates[0]
    else:
        continue
    values_file = VALUES / chunk(identity)
    value_chunk = value_chunks.setdefault(values_file, read(values_file))
    value_chunk['skills'].setdefault(identity, {'effects': []})['healing'] = [{'id': effect_id, 'levels': levels}]
    known[identity] = [{'id': effect_id, 'levels': levels}]
    changed_files.add(values_file)
    published += 1

for path in changed_files:
    write(path, value_chunks[path])
print(f'Published healing ranges for {published} skills in {len(changed_files)} chunks')
