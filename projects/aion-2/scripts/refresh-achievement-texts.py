"""Refresh published achievement names and objectives from matching client exports."""
import argparse
from collections import defaultdict
import hashlib
import importlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value, write


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tables', required=True, type=Path)
parser.add_argument('--localization', required=True, type=Path)
parser.add_argument('--public', default=Path('public'), type=Path)
args = parser.parse_args()

reference = args.public / 'data/reference'
manifest_path = reference / 'manifest.json'
manifest = json.loads(manifest_path.read_text('utf8'))
published_hashes = {row['name']: row['sha256'] for row in manifest['tables']}
for table in ('Achievement', 'AchievementStep', 'AchievementGroup'):
    actual = hashlib.sha256((args.tables / (table + '.json')).read_bytes()).hexdigest()
    if published_hashes.get(table) != actual:
        raise ValueError(f'{table} does not match the published reference snapshot')
table_path = args.tables / 'AchievementString.json'
table_digest = hashlib.sha256(table_path.read_bytes()).hexdigest()
if 'AchievementString' in published_hashes and published_hashes['AchievementString'] != table_digest:
    raise ValueError('AchievementString does not match the published reference snapshot')

ctx = Context(args.tables, args.localization, args.public)
achievement_text = importlib.import_module('achievement-text')
strings = achievement_text.strings_by_name(ctx)
groups = {row['Name']: row for row in ctx.rows('AchievementGroup')}
steps = defaultdict(list)
for row in ctx.rows('AchievementStep'):
    steps[str(value(row['AchievementId']))].append(row)

names = {}
unnamed = {}
milestones = {}
for row in ctx.rows('Achievement'):
    identity = 'Achievement:' + str(value(row['AchievementId']))
    group = groups.get(row['GroupName'], {})
    source_steps = steps[str(value(row['AchievementId']))]
    first_step = source_steps[0] if source_steps else {}
    names[identity] = achievement_text.entry_name(ctx, row, first_step, group, strings)
    unnamed[identity] = not bool(achievement_text.localized_title(ctx, row, first_step, strings))
    milestones[identity] = [achievement_text.step_text(ctx, step, strings) for step in source_steps]


def refresh_names(node):
    changed = False
    if isinstance(node, list):
        for child in node:
            changed |= refresh_names(child)
    elif isinstance(node, dict):
        name = names.get(node.get('id')) if node.get('category') == 'achievements' else None
        if name and node.get('name') != name:
            node['name'] = name
            changed = True
        if name and 'unnamed' in node and node['unnamed'] != unnamed[node['id']]:
            node['unnamed'] = unnamed[node['id']]
            changed = True
        for child in node.values():
            if isinstance(child, (dict, list)):
                changed |= refresh_names(child)
    return changed


changed_files = 0
for path in reference.rglob('*.json'):
    if path == manifest_path:
        continue
    source = path.read_text('utf8')
    if 'Achievement:' not in source and '"category":"achievements"' not in source:
        continue
    data = json.loads(source)
    changed = refresh_names(data)
    if path.parent.name == 'achievements':
        for identity, entry in data['entries'].items():
            rows = next((section['rows'] for section in entry['sections'] if section['title'] == 'reference.labels.milestones'), [])
            source_rows = milestones[identity]
            if len(rows) != len(source_rows):
                raise ValueError(f'Milestone count differs for {identity}')
            for milestone, (title, objective) in zip(rows, source_rows):
                if title and milestone['name'] != title:
                    milestone['name'] = title
                    changed = True
                if objective and milestone.get('description') != objective:
                    milestone['description'] = objective
                    changed = True
    elif path.name == 'index.json':
        entries = data['entries']
        positions = [index for index, entry in enumerate(entries) if entry['category'] == 'achievements']
        if positions and positions != list(range(positions[0], positions[-1] + 1)):
            raise ValueError('Achievement summaries are not contiguous in the reference index')
        if positions:
            before = entries[positions[0]:positions[-1] + 1]
            after = sorted(before, key=lambda entry: (entry.get('unnamed', False), entry['name'].casefold(), entry['id']))
            if before != after:
                entries[positions[0]:positions[-1] + 1] = after
                changed = True
    if changed:
        write(path, data)
        changed_files += 1

if 'AchievementString' not in published_hashes:
    manifest['tables'].append({'name': 'AchievementString', 'rows': len(ctx.rows('AchievementString')), 'sha256': table_digest})
    manifest['tables'].sort(key=lambda row: row['name'])
    write(manifest_path, manifest)

print(f'Refreshed achievement text in {changed_files} reference files')
