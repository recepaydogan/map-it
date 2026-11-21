"""Apply verified shop marker art to the published map points."""
import json
import sys
from importlib import import_module
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent / 'reference-data'))
merchant_icon_path = import_module('world-marker-sources').merchant_icon_path


def main():
    catalog = json.loads((ROOT / 'public/data/merchant-shops.json').read_text('utf8'))
    npc_shops = catalog['npcShops']
    counts = {}
    for path in sorted((ROOT / 'public/maps').glob('*/metadata.json')):
        original = path.read_text('utf8')
        metadata = json.loads(original)
        changed = 0
        for point in metadata.get('locations', []):
            if point.get('category') != 'merchant':
                continue
            npc = npc_shops.get(point.get('entityId'))
            icon = merchant_icon_path(npc['shop']) if npc else None
            if icon and point.get('iconPath') != icon:
                point['iconPath'] = icon
                changed += 1
        if changed:
            path.write_text(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')), 'utf8')
            counts[path.parent.name] = changed
    print(f'Updated {sum(counts.values())} merchant markers across {len(counts)} maps: {counts}')


if __name__ == '__main__':
    main()
