"""Refresh companion details without rebuilding unrelated reference categories."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def write_changed(path, data):
    if not path.exists() or json.loads(path.read_text('utf8')) != data:
        write(path, data)


def refresh(tables, localization, public):
    ctx = Context(tables, localization, public)
    root = ctx.public / 'data/reference'
    builder = importlib.import_module('companion-progression')
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    sources = {source['name']: source for source in manifest['tables']}
    for name in builder.SOURCE_TABLES:
        digest = hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest()
        if name in sources and sources[name]['sha256'] != digest:
            raise ValueError('Source version mismatch: ' + name)
        sources[name] = {'name': name, 'rows': len(ctx.rows(name)), 'sha256': digest}
    chunks = {}
    for path in (root / 'mounts').glob('*.json'):
        chunks[path] = json.loads(path.read_text('utf8'))
        ctx.entries.update(chunks[path]['entries'])
    data = builder.build(ctx)
    for path, chunk in chunks.items():
        write_changed(path, chunk)
    index = json.loads((root / 'index.json').read_text('utf8'))
    for summary in index['entries']:
        if summary['id'] in ctx.entries:
            entry = ctx.entries[summary['id']]
            for field in ('group', 'subtitle', 'icon'):
                if field in entry:
                    summary[field] = entry[field]
    write_changed(root / 'index.json', index)
    manifest['tables'] = sorted(sources.values(), key=lambda source: source['name'])
    write_changed(root / 'manifest.json', manifest)
    # Preserve existing translations; new imported stat labels use English fallback.
    for path in (Path(__file__).parent.parent / 'src/i18n/locales').glob('*.json'):
        locale = json.loads(path.read_text('utf8'))
        for key, label in ctx.labels.items():
            locale['reference']['labels'].setdefault(key, label)
        if json.loads(path.read_text('utf8')) != locale:
            path.write_text(json.dumps(locale, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(f"Refreshed {len(data['pets'])} companions and {len(data['genera'])} genera.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
