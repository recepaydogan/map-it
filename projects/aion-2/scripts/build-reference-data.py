"""Build the linked reference catalog from explicitly supplied local exports."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context, write
import registry
import skills
import equipment
import quests
import recipes
import progression
import activities
import importlib
additional_rules = importlib.import_module('additional-rules')

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tables', required=True)
parser.add_argument('--localization', required=True)
parser.add_argument('--public', default='public')
parser.add_argument('--spawns')
parser.add_argument('--world-maps')
parser.add_argument('--map-data', required=True, help='Decoded map data, including teleport actors and spawn positions')
parser.add_argument('--map-events', required=True, help='Decoded map events for quest instance-area associations')
parser.add_argument('--world-data', required=True, help='Decoded world-map data with source coordinate bounds')
args = parser.parse_args()
ctx = Context(args.tables, args.localization, args.public)
ctx.map_events = importlib.import_module('world-marker-sources').read_event_maps(args.map_events)
for label, build in [('identities', registry.register), ('skills', skills.build), ('equipment', equipment.build), ('decomposition', equipment.decomposition), ('quests', quests.build), ('recipes', recipes.build), ('progression', progression.build), ('activities', activities.build)]:
    print('Importing ' + label, flush=True)
    build(ctx)
importlib.import_module('field-event-entrances').connect(ctx.entries, ctx.rows('NpcData'), ctx.rows('FieldEvent'))
if args.spawns and args.world_maps:
    import world
    world.build(ctx, Path(args.spawns), Path(args.world_maps), publish_markers=False)
activities.sources(ctx)
importlib.import_module('companion-progression').build(ctx)
additional_rules.build(ctx)
importlib.import_module('inline-upgrade-data').build(ctx)
importlib.import_module('loot-rates').build(ctx)
importlib.import_module('skill-link-details').build(ctx)
importlib.import_module('creature-combat-guide').build(ctx)
importlib.import_module('set-item-names').build(ctx)
importlib.import_module('activity-identities').build(ctx)
importlib.import_module('boss-catalog').build(ctx)
importlib.import_module('world-marker-details').register(ctx)
importlib.import_module('world-object-rewards').build(ctx)
importlib.import_module('wing-owned-effects').build(ctx)
importlib.import_module('adventure-identities').build(ctx)
importlib.import_module('dungeon-bosses').build(ctx, args.map_data, args.map_events)
importlib.import_module('portal-routes').build(ctx)
importlib.import_module('travel-positions').import_positions(ctx.entries, ctx.public, ctx.tables, args.map_data, args.world_data)
importlib.import_module('travel-network').build(ctx)
importlib.import_module('world-markers').build(ctx, args.map_data, Path(args.spawns) if args.spawns else None)
importlib.import_module('guild-halls').build(ctx, args.map_data)
importlib.import_module('world-object-rewards').normalize_markers(ctx, args.map_data)
importlib.import_module('dungeon-chest-guides').build(ctx, args.map_events)
importlib.import_module('dungeon-interiors').build(ctx)
importlib.import_module('instance-layer-details').build(ctx)
importlib.import_module('verified-reference-sections').apply(ctx)
importlib.import_module('build-resurrection-services').publish(ctx.tables, ctx.public / 'data/reference/resurrection-services.json')
counts = ctx.finalize()
print('Skill damage records: ' + str(importlib.import_module('skill-damage').publish(ctx)), flush=True)
duplicate_items = importlib.import_module('duplicate-items')
duplicates = duplicate_items.annotate_catalog(ctx.tables, ctx.public)
importlib.import_module('box-catalog').publish(ctx.public)
print('Hidden equivalent or incomplete duplicates: ' + str(len(duplicates)), flush=True)
catalog_path = ctx.public / 'data/items/catalog.json'
source_path = ctx.public / 'data/items/source-manifest.json'
source_manifest = json.loads(source_path.read_text('utf8'))
source_manifest['catalog'].update({'bytes': catalog_path.stat().st_size, 'sha256': hashlib.sha256(catalog_path.read_bytes()).hexdigest()})
source_manifest['counts']['itemsWithDescriptions'] = sum(bool(item.get('description')) for item in ctx.items.values())
source_manifest['counts']['localizedItemNames'] = sum(item.get('nameVerified') is True for item in ctx.items.values())
write(source_path, source_manifest)
locale_dir = Path(__file__).parent.parent / 'src/i18n/locales'
for path in [locale_dir / 'en.json']:
    data = json.loads(path.read_text('utf8'))
    labels = data.setdefault('reference', {}).setdefault('labels', {})
    for key, text in ctx.labels.items():
        labels.setdefault(key, text)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
manifest = {'version': 1, 'categories': counts, 'itemsWithReferenceSections': len(ctx.item_sections), 'warnings': dict(ctx.warnings), 'tables': [{'name': name, 'rows': len(rows), 'sha256': hashlib.sha256((ctx.tables / (name + '.json')).read_bytes()).hexdigest()} for name, rows in sorted(ctx.cache.items())], 'limitations': ['Static client data does not establish live availability or server time.', 'ClientSliderSettings, FieldEventPlatformerDilemma and SeasonRankingReward could not be decoded with the matching schema.']}
write(ctx.public / 'data/reference/manifest.json', manifest)
importlib.import_module('refresh-quest-map-event-objectives').refresh(args.tables, args.public, False)
importlib.import_module('build-player-intelligence').publish(args.tables, args.localization, args.public, args.map_data)
importlib.import_module('collectible-progression').publish(args.tables, args.localization, args.public)
print(json.dumps({'categories': counts, 'warnings': dict(ctx.warnings)}, indent=2))
