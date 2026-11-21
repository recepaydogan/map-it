"""Extract verified item sprites from a packed build into immutable PNG URLs."""
import hashlib
import io
import json
import runpy
import sys
from pathlib import Path

module = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scan-peak-game-data.py'))
catalog_path = Path(sys.argv[1]).resolve()
catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
scanner_type = (runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scan-bundled-peak-data.py'))['BundledScanner']
                if catalog.get('schemaVersion') == 4 else module['GameDataScanner'])
scanner = scanner_type(module['DEFAULT_GAME_ROOT'], catalog_path)
context = scanner.asset_contexts['resources.assets']
output = catalog_path.parent / 'items'
output.mkdir(parents=True, exist_ok=True)
without = []
for item in catalog['items']:
    component = context.file.objects.get(item['id'])
    if component is None:
        raise ValueError(f"Missing item component: {item['displayId']}")
    data = component.read_typetree(nodes=scanner.nodes(scanner.class_for_object(component)))
    if int(data['itemID']) != item['displayId']:
        raise ValueError('Item identity mismatch')
    ptr = data.get('UIData', {}).get('icon', {})
    if not ptr.get('m_PathID'):
        item['icon'] = None
        without.append(item['displayId'])
        continue
    resolved = scanner.resolve_reader(context, ptr)
    if resolved is None:
        raise ValueError(f"Unresolved item sprite: {item['displayId']}")
    buffer = io.BytesIO()
    resolved[1].read().image.save(buffer, 'PNG', optimize=True)
    content = buffer.getvalue()
    digest = hashlib.sha256(content).hexdigest()
    name = f"{item['displayId']}-{digest}.png"
    (output / name).write_bytes(content)
    item['icon'] = f'./data/peak/items/{name}'
catalog['itemIconCoverage'] = {'withSprites': len(catalog['items']) - len(without), 'withoutSprites': sorted(without)}
catalog_path.write_text(json.dumps(catalog, ensure_ascii=False), encoding='utf-8')
print(f"Extracted {len(catalog['items']) - len(without)} immutable item icons; {len(without)} items have no sprite.")
