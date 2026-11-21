"""Refresh boss metadata and rewards without replacing unrelated working data."""
import argparse
import hashlib
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write


def publish(path, data):
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    if path.exists() and path.read_text('utf8') == serialized:
        return
    temporary = path.with_suffix('.tmp')
    write(temporary, data)
    temporary.replace(path)


def refresh(tables, localization, public):
    root = Path(public) / 'data/reference'
    manifest = json.loads((root / 'manifest.json').read_text('utf8'))
    builder = importlib.import_module('boss-catalog')
    sources = {source['name']: source for source in manifest['tables']}
    for name in builder.SOURCE_TABLES:
        digest = hashlib.sha256((Path(tables) / (name + '.json')).read_bytes()).hexdigest()
        if name in sources and sources[name]['sha256'] != digest:
            raise ValueError('Source version mismatch: ' + name)
    ctx = Context(tables, localization, public)
    previous_names = {key: item['name'] for key, item in ctx.items.items()}
    chunks = {}
    for category in ('activities', 'creatures'):
        for path in (root / category).glob('*.json'):
            chunks[path] = json.loads(path.read_text('utf8'))
            ctx.entries.update(chunks[path]['entries'])
    counts = builder.build(ctx)
    renamed = {key: item['name'] for key, item in ctx.items.items() if previous_names[key] != item['name']}
    for path, data in chunks.items():
        publish(path, data)
    index_path = root / 'index.json'
    index = json.loads(index_path.read_text('utf8'))
    for summary in index['entries']:
        entry = ctx.entries.get(summary['id'])
        if entry:
            for key in ('activity', 'subtitle', 'worldBoss'):
                if key in entry:
                    summary[key] = entry[key]
                elif key == 'worldBoss':
                    summary.pop(key, None)
    publish(index_path, index)
    # Keep item-to-activity navigation reciprocal without replacing other sources.
    item_chunks = {}
    for item_id, sections in ctx.item_sections.items():
        path = root / 'items' / (item_id[:3] + '.json')
        if path not in item_chunks:
            item_chunks[path] = json.loads(path.read_text('utf8')) if path.exists() else {'version': 1, 'items': {}}
        data = item_chunks[path]
        target = data['items'].setdefault(item_id, [])
        for section in sections:
            existing = next((s for s in target if s['title'] == section['title']), None)
            if existing is None:
                existing = {'title': section['title'], 'links': []}
                target.append(existing)
            links = {link['id']: link for link in existing.get('links', [])}
            links.update({link['id']: link for link in section['links']})
            existing['links'] = list(links.values())
    for path, data in item_chunks.items():
        publish(path, data)
    if renamed:
        def rename_links(node):
            if isinstance(node, list):
                for child in node:
                    rename_links(child)
            elif isinstance(node, dict):
                if node.get('category') == 'items' and node.get('id') in renamed:
                    node['name'] = renamed[node['id']]
                for child in node.values():
                    if isinstance(child, (dict, list)):
                        rename_links(child)
        for path in root.rglob('*.json'):
            raw = path.read_text('utf8')
            if not any(previous_names[key] in raw for key in renamed):
                continue
            data = json.loads(raw)
            rename_links(data)
            publish(path, data)
    catalog = Path(public) / 'data/items/catalog.json'
    publish(catalog, ctx.catalog)
    source_path = catalog.with_name('source-manifest.json')
    source = json.loads(source_path.read_text('utf8'))
    source['catalog'].update({'bytes': catalog.stat().st_size, 'sha256': hashlib.sha256(catalog.read_bytes()).hexdigest()})
    source['counts']['localizedItemNames'] = sum(item.get('nameVerified') is True for item in ctx.items.values())
    publish(source_path, source)
    manifest['itemsWithReferenceSections'] = sum(len(json.loads(path.read_text('utf8'))['items']) for path in (root / 'items').glob('*.json'))
    for name in builder.SOURCE_TABLES:
        sources[name] = {'name': name, 'rows': len(ctx.rows(name)),
                         'sha256': hashlib.sha256((Path(tables) / (name + '.json')).read_bytes()).hexdigest()}
    manifest['tables'] = sorted(sources.values(), key=lambda row: row['name'])
    publish(root / 'manifest.json', manifest)
    print(json.dumps(counts))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True)
    parser.add_argument('--localization', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    refresh(args.tables, args.localization, args.public)
