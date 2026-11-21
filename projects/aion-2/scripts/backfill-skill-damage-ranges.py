"""Restore native min/max effect links in already published skill damage data."""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import write


ROOT = Path(__file__).resolve().parents[1] / 'public' / 'data'
VALUES = ROOT / 'reference' / 'skill-damage'
SKILL_KEY = re.compile(r'_(\d+)_skill_desc_effect$', re.I)
DAMAGE_RANGE = re.compile(
    r'\{se_dmg:(\d+):SkillUIMinDmg(?:Sum)?\}-'
    r'\{se_dmg:(\d+):SkillUIMaxDmg(?:Sum)?\}', re.I)
DAMAGE_ANY_RANGE = re.compile(
    r'\{(?:se_dmg|se_abe_dmg):[^{}]+?\}-'
    r'\{(?:se_dmg|se_abe_dmg):[^{}]+?\}', re.I)
DAMAGE_FOLLOWS = re.compile(r'^\s*(?:</>)?\s+(?:\w+\s+)?damage\b', re.I)
PLACEHOLDER = re.compile(r'…\s*[-–]\s*…(?=\s+(?:\w+\s+)?damage\b)', re.I)


def chunk(identity):
    return VALUES / (hashlib.sha256(identity.encode()).hexdigest()[:2] + '.json')


source = json.loads((ROOT / 'game-locales' / 'source.json').read_text('utf8'))
native_ranges = {}
native_by_effects = {}
for key, text in zip(source['keys'], source['values']):
    match = SKILL_KEY.search(key)
    if match and isinstance(text, str):
        pairs = []
        for pair in DAMAGE_ANY_RANGE.finditer(text):
            if DAMAGE_FOLLOWS.match(text[pair.end():]):
                direct = DAMAGE_RANGE.fullmatch(pair.group())
                pairs.append(list(direct.groups()) if direct else None)
        native_ranges['Skill:' + match[1]] = pairs
        direct_ids = tuple(dict.fromkeys(effect_id for pair in pairs if pair for effect_id in pair))
        if direct_ids:
            native_by_effects.setdefault((direct_ids, len(pairs)), {})[str(pairs)] = pairs

chunks = {path: json.loads(path.read_text('utf8')) for path in VALUES.glob('*.json')}
records = {identity: record for data in chunks.values() for identity, record in data['skills'].items()}


def signature(record):
    return (record.get('description'), tuple(effect['id'] for effect in record['effects']))


known = {}
for identity, record in records.items():
    pairs = native_ranges.get(identity, [])
    ids = {effect['id'] for effect in record['effects']}
    if any(pairs) and len(pairs) == len(PLACEHOLDER.findall(record.get('description', ''))):
        if all(pair is None or (pair[0] in ids and pair[1] in ids) for pair in pairs):
            known[signature(record)] = pairs

changed = set()
count = 0
for identity, record in records.items():
    pairs = known.get(signature(record))
    if not pairs:
        candidates = native_by_effects.get((tuple(effect['id'] for effect in record['effects']),
                                            len(PLACEHOLDER.findall(record.get('description', '')))), {})
        if len(candidates) == 1:
            pairs = next(iter(candidates.values()))
    if pairs and record.get('damageRanges') != pairs:
        record['damageRanges'] = pairs
        changed.add(chunk(identity))
        count += 1

for path in changed:
    write(path, chunks[path])
print(f'Linked native damage ranges for {count} skills in {len(changed)} chunks.')
