"""Fill verified divided skill values in existing reference chunks."""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write


ROOT = Path(__file__).resolve().parents[1] / 'public' / 'data'
REFERENCE = ROOT / 'reference'
SKILL_KEY = re.compile(r'_(\d+)_skill_desc_effect$', re.I)
DIVIDED_VALUE = re.compile(r'\{abe:(\d+):value(\d+):divide1000\}', re.I)


def entry_file(category, identity):
    chunk = hashlib.sha256(identity.encode()).hexdigest()[:2] + '.json'
    return REFERENCE / category / chunk


source = json.loads((ROOT / 'game-locales' / 'source.json').read_text('utf8'))
chunks = {}
changed = set()

for key, text in zip(source['keys'], source['values']):
    match = SKILL_KEY.search(key)
    if not match or not isinstance(text, str):
        continue
    tokens = DIVIDED_VALUE.findall(text)
    if not tokens:
        continue
    identity = 'Skill:' + match[1]
    path = entry_file('skills', identity)
    chunk = chunks.setdefault(path, json.loads(path.read_text('utf8')))
    entry = chunk['entries'].get(identity)
    if entry is None:
        continue
    description = entry.get('description', '')
    if '…%' not in description:
        continue
    if description.count('…%') != len(tokens):
        raise ValueError(f'Unexpected divided-value placeholders for {identity}')
    for effect_id, field in tokens:
        owner = 'SkillAbnormal:' + effect_id[:-1]
        effect_path = entry_file('effects', owner)
        effect_chunk = chunks.setdefault(effect_path, json.loads(effect_path.read_text('utf8')))
        effect = effect_chunk['entries'].get(owner)
        rows = next((section['rows'] for section in effect.get('sections', [])
                     if section['title'] == 'reference.labels.effects'), []) if effect else []
        row_index = int(effect_id[-1]) - 1
        field_index = int(field) - 1
        if row_index < 0 or row_index >= len(rows):
            raise ValueError(f'No verified effect row for {effect_id}')
        values = rows[row_index]['facts'][0]['value'].split(', ')
        if field_index < 0 or field_index >= len(values):
            raise ValueError(f'No verified effect value for {effect_id}:value{field}')
        number = float(values[field_index]) / 1000
        description = description.replace('…%', f'{number:g}%', 1)
    if description != entry['description']:
        entry['description'] = description
        changed.add(path)

for path in changed:
    write(path, chunks[path])
print(f'Backfilled divided skill values in {len(changed)} reference chunks')
