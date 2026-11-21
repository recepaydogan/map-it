"""Refresh travel data from published, verified relationships without raw exports."""
import argparse
import importlib
import json
import hashlib
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write
travel = importlib.import_module('travel-network')


def refresh(public, tables=None, map_data=None, world_data=None, localization=None):
    root = Path(public)
    reference = root / 'data/reference'
    entries = {}
    for category in ('travel', 'exploration', 'creatures'):
        for path in (reference / category).glob('*.json'):
            entries.update(json.loads(path.read_text('utf8'))['entries'])
    if any((tables, map_data, world_data)):
        if not all((tables, map_data, world_data)):
            raise ValueError('Position import requires tables, map-data and world-data together')
        manifest = json.loads((reference / 'manifest.json').read_text('utf8'))
        for table in manifest['tables']:
            if table['name'] in ('Map', 'RiftData', 'Teleport', 'EnvObjData', 'NpcData'):
                if hashlib.sha256((Path(tables) / (table['name'] + '.json')).read_bytes()).hexdigest() != table['sha256']:
                    raise ValueError('Source version mismatch: ' + table['name'])
        if localization:
            ctx = Context(tables, localization, root)
            ctx.entries = entries
            importlib.import_module('portal-routes').build(ctx)
        print(json.dumps(importlib.import_module('travel-positions').import_positions(entries, root, tables, map_data, world_data)))
    maps = {path.parent.name: json.loads(path.read_text('utf8')) for path in (root / 'maps').glob('*/metadata.json')}
    audit = travel.enrich(entries, maps)
    for path in reference.rglob('*.json'):
        data = json.loads(path.read_text('utf8'))
        before = json.dumps(data, ensure_ascii=False)
        if path.parent.name in ('travel', 'exploration', 'creatures'):
            data['entries'] = {key: entries[key] for key in data['entries']}
        elif path.name == 'index.json':
            known = {summary['id'] for summary in data['entries']}
            for entry in entries.values():
                if entry['id'] not in known:
                    data['entries'].append({**{k: entry[k] for k in ('id', 'category', 'name', 'unnamed', 'travel', 'group', 'subtitle') if k in entry},
                                            'chunk': hashlib.sha256(entry['id'].encode()).hexdigest()[:2]})
            for summary in data['entries']:
                if summary['category'] == 'travel':
                    entry = entries[summary['id']]
                    summary.update({key: entry[key] for key in ('name', 'unnamed', 'travel')})
            data['entries'].sort(key=lambda e: (e['category'], e.get('unnamed', False), e['name'].casefold(), e['id']))
            for category in data['categories']:
                category['count'] = sum(e['category'] == category['id'] for e in data['entries'])
        travel.refresh_names(data, entries)
        if json.dumps(data, ensure_ascii=False) != before:
            write(path, data)
    chunks = {}
    for entry in entries.values():
        if entry['category'] == 'travel':
            bucket = hashlib.sha256(entry['id'].encode()).hexdigest()[:2]
            chunks.setdefault(bucket, {})[entry['id']] = entry
    for bucket, records in chunks.items():
        write(reference / 'travel' / (bucket + '.json'), {'version': 1, 'entries': records})
    manifest = json.loads((reference / 'manifest.json').read_text('utf8'))
    manifest['categories']['travel'] = sum(e['category'] == 'travel' for e in entries.values())
    write(reference / 'manifest.json', manifest)
    write(reference / 'travel-audit.json', audit)
    print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in audit.items()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', default='public')
    parser.add_argument('--tables')
    parser.add_argument('--map-data')
    parser.add_argument('--world-data')
    parser.add_argument('--localization', help='Matching localization; also imports explicit object portal routes')
    args = parser.parse_args()
    refresh(args.public, args.tables, args.map_data, args.world_data, args.localization)
