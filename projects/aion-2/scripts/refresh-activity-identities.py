"""Refresh activity presentation and incoming names without rebuilding other data."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(tables, localization, public):
    root = Path(public) / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    for source in manifest['tables']:
        if source['name'] in ('FieldEvent', 'BossChallengeContents', 'Map', 'NpcData'):
            path = Path(tables) / (source['name'] + '.json')
            if hashlib.sha256(path.read_bytes()).hexdigest() != source['sha256']:
                raise ValueError('Source version mismatch: ' + source['name'])
    ctx = Context.__new__(Context)
    ctx.tables, ctx.cache, ctx.entries = Path(tables), {}, {}
    ctx.strings = {key.casefold(): val for key, val in json.loads(Path(localization).read_text('utf8'))['Entries'].items()}
    for path in (root / 'activities').glob('*.json'):
        ctx.entries.update(json.loads(path.read_text('utf8'))['entries'])
    importlib.import_module('activity-identities').build(ctx)

    def update(node):
        if isinstance(node, list):
            for child in node:
                update(child)
        elif isinstance(node, dict):
            if node.get('category') == 'activities' and node.get('id') in ctx.entries:
                entry = ctx.entries[node['id']]
                node['name'] = entry['name']
                if 'chunk' in node or 'sections' in node:
                    node['activity'] = entry['activity']
            for child in node.values():
                if isinstance(child, (list, dict)):
                    update(child)

    changed = 0
    for path in root.rglob('*.json'):
        data = json.loads(path.read_text('utf8'))
        before = json.dumps(data, ensure_ascii=False)
        update(data)
        if json.dumps(data, ensure_ascii=False) != before:
            write(path, data)
            changed += 1
    print(f'Refreshed activity identities and links in {changed} files.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
