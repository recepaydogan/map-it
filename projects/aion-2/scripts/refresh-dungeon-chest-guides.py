"""Refresh source-ordered dungeon objectives and contextual chest guide links."""
import argparse
import hashlib
import importlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def refresh(args):
    ctx = Context(args.tables, args.localization, args.public)
    root = ctx.public / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {row['name']: row['sha256'] for row in manifest['tables']}
    for name in ('Dungeon', 'EnvObjData', 'Item'):
        if hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest() != hashes[name]:
            raise ValueError('Source version mismatch: ' + name)
    chunks = {}
    for category in ('dungeons', 'exploration'):
        for path in (root / category).glob('*.json'):
            chunk = json.loads(path.read_text('utf8'))
            chunks[path] = chunk
            ctx.entries.update(chunk['entries'])
    before = {path: json.dumps(chunk, sort_keys=True) for path, chunk in chunks.items()}
    report = importlib.import_module('dungeon-chest-guides').build(ctx, args.map_events)
    for path, chunk in chunks.items():
        if json.dumps(chunk, sort_keys=True) != before[path]:
            write(path, chunk)
    locale_path = Path('src/i18n/locales/en.json')
    locale = json.loads(locale_path.read_text('utf8'))
    locale['reference']['labels'].update(ctx.labels)
    write(locale_path, locale, indent=2)
    print(json.dumps({'dungeons': len(report['dungeons']), 'markers': report['markerCount']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('tables', 'localization', 'map-events'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--public', default='public')
    refresh(parser.parse_args())
