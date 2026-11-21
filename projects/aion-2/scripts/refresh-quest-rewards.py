"""Refresh quest rewards without discarding class-to-item associations."""
import argparse
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value, write
from quests import add_rewards


def refresh(tables, localization, public):
    root = Path(public) / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {row['name']: row['sha256'] for row in manifest['tables']}
    for name in ['Quest', 'QuestReward', 'QuestClassReward', 'Item']:
        digest = hashlib.sha256((Path(tables) / (name + '.json')).read_bytes()).hexdigest()
        if hashes.get(name) != digest:
            raise ValueError('Source version mismatch: ' + name)
    ctx = Context(tables, localization, public)
    rewards = defaultdict(list)
    for table in ['QuestReward', 'QuestClassReward']:
        for row in ctx.rows(table):
            rewards[row['Group']].append(row)
    quests = {'Quest:' + str(value(row['ID'])): row for row in ctx.rows('Quest')}
    changed = 0
    for path in sorted((root / 'quests').glob('*.json')):
        data = json.loads(path.read_text('utf8'))
        before = json.dumps(data, ensure_ascii=False)
        for entry in data['entries'].values():
            row = quests[entry['id']]
            source = rewards[str(value(row['ID']))] + rewards[row['Name']]
            if not any(reward.get('Class') for reward in source):
                continue
            rebuilt = {**entry, 'sections': []}
            add_rewards(ctx, rebuilt, source)
            replacements = {section['title']: section for section in rebuilt['sections']}
            entry['sections'] = [replacements.pop(section['title'], section)
                                 for section in entry['sections']]
            entry['sections'].extend(replacements.values())
        if json.dumps(data, ensure_ascii=False) != before:
            write(path, data)
            changed += 1
    print(json.dumps({'changedQuestChunks': changed}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
