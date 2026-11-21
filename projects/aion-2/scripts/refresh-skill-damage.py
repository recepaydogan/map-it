"""Refresh skill damage previews from tables matching the published reference build."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, clean


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tables', required=True, type=Path)
parser.add_argument('--localization', required=True, type=Path)
parser.add_argument('--public', default='public', type=Path)
args = parser.parse_args()

manifest = json.loads((args.public / 'data/reference/manifest.json').read_text('utf8'))
expected = {row['name']: row['sha256'] for row in manifest['tables']}
for name in ('Item', 'Skill', 'SkillString', 'SkillEffect', 'SkillEffectLv', 'SkillAbnormalEffect'):
    actual = hashlib.sha256((args.tables / (name + '.json')).read_bytes()).hexdigest()
    if actual != expected[name]:
        raise ValueError(f'{name} does not match the published reference build')

ctx = Context(args.tables, args.localization, args.public)
source = json.loads((args.public / 'data/game-locales/source.json').read_text('utf8'))
source_text = dict(zip(source['keys'], source['values']))
for row in ctx.rows('SkillString'):
    for field in ('SkillSpecDesc', 'SkillDescEffect'):
        key = row[field].get('Key', '')
        if key and key != 'None' and clean(source_text.get(key, '')) != ctx.raw_text(key):
            raise ValueError(f'Skill text does not match published game locale: {key}')

count = importlib.import_module('skill-damage').publish(ctx)
print(f'Published {count} skill damage records')
