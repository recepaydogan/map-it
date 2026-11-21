"""Refresh creature combat guides without rebuilding other categories or maps."""
import argparse
import hashlib
import importlib
import json
import sys
import os
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context


def publish_json(path, data):
    """Replace complete JSON files; retry only transient Windows sharing failures."""
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf8', dir=path.parent, suffix='.tmp', delete=False) as output:
        json.dump(data, output, ensure_ascii=False, separators=(',', ':'))
        temporary = Path(output.name)
    try:
        for attempt in range(6):
            try:
                os.replace(temporary, path)
                break
            except OSError as error:
                if getattr(error, 'winerror', None) not in (5, 32, 33) or attempt == 5:
                    raise
                time.sleep(0.15 * (attempt + 1))
    finally:
        if temporary.exists():
            temporary.unlink()


def refresh(tables, localization, public):
    ctx = Context(tables, localization, public)
    root = ctx.public / 'data/reference'
    builder = importlib.import_module('creature-combat-guide')
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    hashes = {source['name']: source['sha256'] for source in manifest['tables']}
    dungeon_audit = json.loads((root / 'dungeon-boss-audit.json').read_text('utf8'))
    hashes.update({source['name']: source['sha256'] for source in dungeon_audit.get('tables', [])})
    for name in builder.SOURCE_TABLES:
        if name in hashes and hashes[name] != hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest():
            raise ValueError('Source version mismatch: ' + name)
    chunks = {}
    for path in (root / 'creatures').glob('*.json'):
        data = json.loads(path.read_text('utf8'))
        chunks[path] = data
        ctx.entries.update(data['entries'])
    report = builder.build(ctx, publish=False)
    for path, data in chunks.items():
        publish_json(path, data)
    publish_json(root / "creature-combat-audit.json", ctx.combat_audit)
    print(f'Published combat guides for {len(ctx.entries)} creatures in {len(chunks)} chunks.')
    print(json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
