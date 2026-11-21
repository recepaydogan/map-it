"""Refresh ascension reward links from the matching decoded client tables."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, value, write
from progression import build_ascension_rewards


def read(path):
    return json.loads(path.read_text('utf8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables', required=True, type=Path)
    parser.add_argument('--localization', required=True, type=Path)
    parser.add_argument('--public', default=Path('public'), type=Path)
    args = parser.parse_args()

    reference = args.public / 'data/reference'
    manifest_path = reference / 'manifest.json'
    manifest = read(manifest_path)
    for name in ('Item', 'Ascension'):
        expected = next(table['sha256'] for table in manifest['tables'] if table['name'] == name)
        actual = hashlib.sha256((args.tables / (name + '.json')).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f'{name} table does not match the published reference data')

    ctx = Context(args.tables, args.localization, args.public)
    chunks = {}
    for row in ctx.rows('Ascension'):
        entry_id = 'Ascension:' + str(value(row['DataId']))
        bucket = hashlib.sha256(entry_id.encode()).hexdigest()[:2]
        chunk = chunks.setdefault(bucket, read(reference / 'progression' / (bucket + '.json')))
        entry = chunk['entries'][entry_id]
        entry['sections'] = [section for section in entry['sections'] if section['title'] != 'reference.labels.rewards']
        ctx.entries[entry_id] = entry
        ctx.aliases[('Ascension', row['Name'].casefold())] = entry_id

    build_ascension_rewards(ctx)
    for bucket, chunk in chunks.items():
        write(reference / 'progression' / (bucket + '.json'), chunk)

    item_dir = reference / 'items'
    item_chunks = {}
    for item_id, incoming in ctx.item_sections.items():
        bucket = item_id[:3]
        chunk = item_chunks.setdefault(bucket, read(item_dir / (bucket + '.json')))
        sections = chunk['items'].setdefault(item_id, [])
        section = next((section for section in sections if section['title'] == 'reference.labels.additional-acquisition-sources'), None)
        if section is None:
            section = {'title': 'reference.labels.additional-acquisition-sources', 'links': []}
            sections.append(section)
        links = {json.dumps(link, sort_keys=True): link for link in section.get('links', [])}
        for source in incoming:
            for link in source.get('links', []):
                links[json.dumps(link, sort_keys=True)] = link
        section['links'] = list(links.values())
    for bucket, chunk in item_chunks.items():
        write(item_dir / (bucket + '.json'), chunk)

    source = args.tables / 'AscensionReward.json'
    manifest['tables'] = [table for table in manifest['tables'] if table['name'] != 'AscensionReward']
    manifest['tables'].append({'name': 'AscensionReward', 'rows': len(ctx.rows('AscensionReward')),
                               'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
    manifest['tables'].sort(key=lambda table: table['name'])
    manifest['itemsWithReferenceSections'] = sum(len(read(path)['items']) for path in item_dir.glob('*.json'))
    for key, count in ctx.warnings.items():
        manifest['warnings'][key] = count
    write(manifest_path, manifest)
    print(f'Updated {len(ctx.entries)} ascension stages and {len(ctx.item_sections)} reward items')


if __name__ == '__main__':
    main()
