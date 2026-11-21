"""Merge exact icon-table joins and extracted PNGs for a scoped client refresh."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image


def read(path):
    return json.loads(Path(path).read_text('utf8'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--items', required=True)
    parser.add_argument('--icon-tables', nargs='+', required=True)
    parser.add_argument('--textures', required=True)
    parser.add_argument('--public', default='public')
    args = parser.parse_args()
    public = Path(args.public)
    provenance = read(public / 'data/items/icon-sources.json')
    catalog = read(public / 'data/items/catalog.json')
    supplement = read(public / 'data/reference/client-supplement.json')
    selected = set(supplement['itemIds'])
    native = {str(r['ID']['Value']): r for r in read(args.items)['Properties']['Data']}
    rows = {}
    for file in args.icon_tables:
        tables = [t for t in read(file) if t.get('Type') == 'DataTable']
        if len(tables) != 1 or not tables[0]['Rows']:
            raise ValueError('Icon table must be completely decoded: ' + file)
        rows.update({k.casefold(): v for k, v in tables[0]['Rows'].items()})
    assets = {a['assetPath']: a for a in provenance['assets']}
    sources = {i['id']: i for i in provenance['items']}
    added = []
    for item in catalog['items']:
        if item['id'] not in selected:
            continue
        row = native[item['id']]
        mapping = rows[row['IconRes'].casefold()]
        # Some mapping providers annotate the property array index in JSON.
        mapping = {k.split('[')[0]: v for k, v in mapping.items()}
        asset_path = (mapping.get('ResourceObject_Global', {}).get('AssetPathName') or mapping['ResourceObject']['AssetPathName']).split('.')[0]
        if not asset_path.startswith('/Game/'):
            raise ValueError('Invalid icon resource path: ' + asset_path)
        if asset_path not in assets:
            source = Path(args.textures) / ('AION2/Content/' + asset_path.removeprefix('/Game/') + '.png')
            with Image.open(source) as image:
                image.verify()
                width, height = image.size
            filename = Path(asset_path).name.lower().replace('_', '-') + '.png'
            relative = 'data/items/icons/' + filename
            output = public / relative
            if output.exists() and sha(output) != sha(source):
                raise ValueError('Conflicting icon destination: ' + relative)
            shutil.copyfile(source, output)
            assets[asset_path] = {'assetPath': asset_path, 'path': relative, 'sha256': sha(source), 'width': width, 'height': height}
            added.append(relative)
        item['icon'] = assets[asset_path]['path']
        sources[item['id']] = {'id': item['id'], 'iconKey': row['IconRes'], 'assetPath': asset_path}
    provenance['assets'] = list(assets.values())
    provenance['items'] = list(sources.values())
    provenance['supplementInputs'] = [{'name': Path(p).name, 'sha256': sha(p)} for p in [args.items, *args.icon_tables]]
    for relative, data in [('data/items/catalog.json', catalog), ('data/items/icon-sources.json', provenance)]:
        (public / relative).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    current = {item['id']: item for item in catalog['items']}

    def refresh_links(node):
        if isinstance(node, dict):
            if node.get('category') == 'items' and node.get('id') in selected:
                item = current[node['id']]
                node.update(name=item['name'], icon=item['icon'])
            for child in node.values():
                refresh_links(child)
        elif isinstance(node, list):
            for child in node:
                refresh_links(child)

    summaries = {r['id']: r for r in read(public / 'data/reference/index.json')['entries']}
    paths = {public / 'data/reference' / summaries[i]['category'] / (summaries[i]['chunk'] + '.json') for i in supplement['entryIds']}
    paths.update((public / 'data/reference/items').glob('*.json'))
    for path in paths:
        data = read(path)
        before = json.dumps(data)
        refresh_links(data)
        if json.dumps(data) != before:
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    manifest_path = public / 'data/items/source-manifest.json'
    manifest = read(manifest_path)
    for key, relative in [('catalog', 'data/items/catalog.json'), ('iconSources', 'data/items/icon-sources.json')]:
        path = public / relative
        manifest[key] = {'path': relative, 'bytes': path.stat().st_size, 'sha256': sha(path)}
    manifest['counts']['itemsWithIcons'] = sum(bool(i.get('icon')) for i in catalog['items'])
    manifest['counts']['uniqueIcons'] = len({i['icon'] for i in catalog['items'] if i.get('icon')})
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(json.dumps({'items': len(selected), 'addedTextures': added}))


if __name__ == '__main__':
    main()
