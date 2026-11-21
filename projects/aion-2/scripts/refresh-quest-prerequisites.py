"""Refresh quest acquisition conditions from matching decoded client tables."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value, write

quest_requirements = importlib.import_module('adventure-identities').quest_requirements


def refresh(tables, localization, public, dry_run=False):
    root = Path(public) / 'data/reference'
    manifest_path = root / 'manifest.json'
    manifest = json.loads(manifest_path.read_text('utf8'))
    source_hashes = {source['name']: source['sha256'] for source in manifest['tables']}
    for name in ('Quest', 'QuestStep', 'EnvObjData', 'Subzone'):
        path = Path(tables) / (name + '.json')
        if not path.exists():
            raise FileNotFoundError(path)
        if name in source_hashes and hashlib.sha256(path.read_bytes()).hexdigest() != source_hashes[name]:
            raise ValueError('Source version mismatch: ' + name)

    ctx = Context.__new__(Context)
    ctx.tables = Path(tables)
    ctx.cache = {}
    ctx.token_tables = None
    ctx.strings = {key.casefold(): text for key, text in
                   json.loads(Path(localization).read_text('utf8'))['Entries'].items()}
    ctx.entries = {}
    quest_files = {}
    for category in ('quests', 'exploration'):
        for path in sorted((root / category).glob('*.json')):
            entries = json.loads(path.read_text('utf8'))['entries']
            ctx.entries.update(entries)
            if category == 'quests':
                quest_files[path] = entries

    quests = {row['Name']: row for row in ctx.rows('Quest')}
    quests_by_id = {str(value(row['ID'])): row for row in quests.values()}
    steps = {str(value(row['ID'])): row for row in ctx.rows('QuestStep')}
    environment = {row['Name']: row for row in ctx.rows('EnvObjData')}
    subzones = {row['Name']: row for row in ctx.rows('Subzone')}
    changed = set()
    before_unresolved = after_unresolved = 0
    resolved_subzones = set()
    for path, entries in quest_files.items():
        for entry in entries.values():
            row = quests_by_id.get(entry['id'].split(':')[-1])
            if row is None:
                raise ValueError('Missing source quest: ' + entry['id'])
            before_unresolved += bool(entry.get('unresolvedRequirements'))
            requirements, unresolved = quest_requirements(ctx, row, quests, steps, environment, subzones)
            after_unresolved += unresolved
            resolved_subzones.update(condition['Value'] for condition in row['AcquirableConditions']
                                     if condition['Type'].endswith('::SubZone')
                                     and (subzone := subzones.get(condition['Value']))
                                     and ctx.text(subzone['DisplayName']))
            if entry.get('questRequirements') != requirements or entry.get('unresolvedRequirements') != unresolved:
                entry['questRequirements'] = requirements
                entry['unresolvedRequirements'] = unresolved
                changed.add(path)

    print(f'Quest files changed: {len(changed)}; unresolved quests: {before_unresolved} -> {after_unresolved}; '
          f'resolved subzone names: {len(resolved_subzones)}')
    if dry_run:
        return
    for path in sorted(changed):
        write(path, {'version': 1, 'entries': quest_files[path]})
    if 'Subzone' not in source_hashes:
        path = Path(tables) / 'Subzone.json'
        manifest['tables'].append({'name': 'Subzone', 'rows': len(ctx.cache['Subzone']),
                                   'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        manifest['tables'].sort(key=lambda source: source['name'])
        write(manifest_path, manifest)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True, type=Path)
    parser.add_argument('--localization', required=True, type=Path)
    parser.add_argument('--public', default='public', type=Path)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public, args.dry_run)
