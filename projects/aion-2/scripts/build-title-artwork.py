"""Publish title artwork whose exact native texture has been exported."""

import argparse
import hashlib
import json
import shutil
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(table, texture_roots, public):
    rows = json.loads(table.read_text('utf8'))['Properties']['Data']
    textures = {}
    for root in texture_roots:
        for path in root.rglob('*.png'):
            previous = textures.get(path.stem)
            if previous and digest(previous) != digest(path):
                raise ValueError(f'Conflicting title texture exports: {path.stem}')
            textures[path.stem] = path

    assets = {}
    titles = {}
    missing = set()
    for row in rows:
        artwork = {}
        for field, role in (('BGImage', 'background'), ('DecoImage', 'icon')):
            key = row[field]
            if key == 'None':
                continue
            source = textures.get(key)
            if not source:
                missing.add(key)
                continue
            parts = source.parts
            if 'AION2' not in parts:
                raise ValueError(f'Export has no native asset path: {source}')
            asset = '/'.join(parts[parts.index('AION2'):])[:-4] + '.uasset'
            name = key.lower().replace('_', '-') + '.png'
            output = public / 'data/reference/title-artwork' / name
            output.parent.mkdir(parents=True, exist_ok=True)
            if not output.exists() or digest(output) != digest(source):
                shutil.copyfile(source, output)
            relative = output.relative_to(public).as_posix()
            assets[key] = {'path': relative, 'sourceAsset': asset, 'sha256': digest(source)}
            artwork[role] = relative
        if artwork:
            titles['Title:' + str(row['ID']['Value'])] = artwork

    manifest = {'version': 1, 'titleTableSha256': digest(table), 'assets': assets,
                'titles': titles, 'missingTextureKeys': sorted(missing)}
    destination = public / 'data/reference/title-artwork-sources.json'
    destination.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print(f'Published {len(assets)} textures for {len(titles)} titles; {len(missing)} keys unavailable')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--table', required=True, type=Path)
    parser.add_argument('--textures', required=True, type=Path, action='append')
    parser.add_argument('--public', type=Path, default=Path('public'))
    args = parser.parse_args()
    build(args.table, args.textures, args.public)
