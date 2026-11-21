"""Verify image-backed insets, layout isolation, native positions and references."""
import importlib
import json
from pathlib import Path
import sys
import unittest

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from world import EDITORIAL_BOSS_NPC_IDS
project = importlib.import_module('travel-positions').project
PUBLIC = Path(__file__).parent.parent / 'public'
EDITORIAL_BOSS_REFERENCES = {f'NpcData:{npc_id}' for npc_id in EDITORIAL_BOSS_NPC_IDS}


def read(path):
    return json.loads(path.read_text('utf8'))


def overlaps(a, b):
    return a['minX'] < b['maxX'] and b['minX'] < a['maxX'] and a['minY'] < b['maxY'] and b['minY'] < a['maxY']


class InteriorMapTests(unittest.TestCase):
    def test_boss_markers_match_exact_modes_or_reviewed_encounters(self):
        audit = read(PUBLIC / 'data/reference/dungeon-boss-audit.json')
        bosses = {}
        for dungeon in audit['dungeons']:
            bosses.setdefault(dungeon['mapId'], set()).update(dungeon['bossIds'])
        krao = set()
        checked = 0
        for path in (PUBLIC / 'maps').glob('*/metadata.json'):
            for point in read(path)['locations']:
                map_id = point.get('eventLayerMapId')
                if map_id is None and point.get('insetId', '').startswith('interior-'):
                    map_id = int(point['insetId'].removeprefix('interior-'))
                if map_id is None or point.get('reference', {}).get('category') != 'creatures':
                    continue
                editorial = point['reference']['id'] in EDITORIAL_BOSS_REFERENCES
                expected = point['reference']['id'] in bosses.get(map_id, set()) or editorial
                self.assertEqual(point['category'] == 'dungeon-boss', expected,
                                 (path.parent.name, map_id, point['id']))
                if expected:
                    checked += 1
                    if map_id == 600001:
                        krao.add(point['name'])
        self.assertGreater(checked, 0)
        self.assertEqual(krao, {'Enhanced Harcon', 'Neglected Gadioton', 'Ultimate Berk'})

    def test_real_images_nonoverlapping_layout_and_native_marker_projection(self):
        locale = read(PUBLIC.parent / 'src/i18n/locales/en.json')['mapInteriors']['names']
        checked = 0
        for path in (PUBLIC / 'maps').glob('*/metadata.json'):
            data = read(path)
            insets = {i['id']: i for i in data.get('insets', [])}
            self.assertEqual(len(insets), len(data.get('insets', [])))
            for inset in insets.values():
                self.assertEqual(locale[str(inset['worldMapId'])], inset['name'])
                self.assertGreater(inset['worldProjection']['size']['X'], 0)
                self.assertGreater(inset['worldProjection']['size']['Y'], 0)
                image_path = (path.parent / inset['image']).resolve()
                self.assertTrue(image_path.is_relative_to((PUBLIC / 'maps').resolve()))
                with Image.open(image_path) as image:
                    image.verify()
                self.assertFalse(overlaps(inset['bounds'], data['bounds']) and not data.get('hideBaseTiles'))
                for other in insets.values():
                    if inset != other:
                        self.assertFalse(overlaps(inset['bounds'], other['bounds']), (inset['id'], other['id']))
                checked += 1
            for point in data['locations']:
                if not point.get('insetId') or point.get('mapAnnotation'):
                    continue
                inset = insets[point['insetId']]
                expected = project(point['worldPosition'], inset['worldProjection'], inset['bounds'])
                self.assertEqual((point['x'], point['y']), (expected['x'], expected['y']))
                self.assertEqual(point['sourceAsset'], inset['sourceMap'])
        self.assertGreater(checked, 0)

    def test_missing_images_never_become_schematics(self):
        audit = read(PUBLIC / 'data/reference/interior-map-audit.json')
        included = {r['mapId'] for r in audit['included']}
        self.assertFalse(included & {r['mapId'] for r in audit['excluded']})
        for record in audit['included']:
            self.assertTrue(record['sourceTiles'])
            self.assertTrue(all(len(t['sha256']) == 64 for t in record['sourceTiles']))

    def test_published_event_destinations_link_to_their_interiors(self):
        catalog = read(PUBLIC / 'data/event-entrances.json')['npcs']
        audit = read(PUBLIC / 'data/reference/interior-map-audit.json')
        published = {(row['mapId'], row['parent']) for row in audit['included']}
        index = {entry['id']: entry for entry in read(PUBLIC / 'data/reference/index.json')['entries']}
        checked = set()
        for entrance in catalog.values():
            destination_id = entrance['destinationId']
            map_id = entrance['mapId']
            if not destination_id or map_id in checked or not any(row[0] == map_id for row in published):
                continue
            summary = index[destination_id]
            chunk = read(PUBLIC / 'data/reference/dungeons' / (summary['chunk'] + '.json'))
            destination = chunk['entries'][destination_id]
            self.assertTrue(any((map_id, target['mapId']) in published
                                and target['insetId'] == 'interior-' + str(map_id)
                                for target in destination.get('interiorMaps', [])))
            world_parents = {parent for candidate, parent in published
                             if candidate == map_id and parent != 'dungeon-atlas'}
            for parent in world_parents:
                markers = {point['id'] for point in read(PUBLIC / 'maps' / parent / 'metadata.json')['locations']
                           if point['category'] == 'event-entrance'}
                self.assertTrue(any(location['mapId'] == parent and location['markerId'] in markers
                                    for location in destination['locations']))
            checked.add(map_id)
        self.assertTrue(checked)

    def test_every_event_entrance_has_its_exact_map_target_and_native_pins(self):
        catalog = read(PUBLIC / 'data/event-entrances.json')['npcs']
        audit = read(PUBLIC / 'data/reference/interior-map-audit.json')
        image_maps = {row['mapId'] for row in audit['included']}
        maps = {path.parent.name: read(path) for path in (PUBLIC / 'maps').glob('*/metadata.json')}
        names = read(PUBLIC.parent / 'src/i18n/locales/en.json')['mapInteriors']['names']
        index = {entry['id']: entry for entry in read(PUBLIC / 'data/reference/index.json')['entries']}
        related_image_by_family = {}
        for detail in catalog.values():
            if detail['mapId'] not in image_maps:
                continue
            activity = index[detail['eventId']]['activity']
            related_image_by_family[(activity['familyId'], activity['faction'])] = detail['mapId']
        for npc_id, entrance in catalog.items():
            map_id = entrance['mapId']
            if map_id in image_maps:
                destination_id = entrance['destinationId']
                self.assertIsNotNone(destination_id, npc_id)
                summary = index[destination_id]
                destination = read(PUBLIC / 'data/reference' / summary['category'] /
                                   (summary['chunk'] + '.json'))['entries'][destination_id]
                self.assertTrue(destination.get('interiorMaps'), npc_id)
                for target in destination['interiorMaps']:
                    points = maps[target['mapId']]['locations']
                    self.assertTrue(any(point.get('mapAnnotation') and point.get('insetId') == target['insetId']
                                        and point['reference']['id'] == destination_id for point in points), npc_id)
                continue
            area = entrance.get('eventArea')
            self.assertIsNotNone(area, npc_id)
            self.assertTrue(names[str(map_id)], npc_id)
            self.assertEqual(area['nameKey'], 'mapInteriors.names.' + str(map_id))
            metadata = maps[area['mapId']]
            self.assertTrue(any(region['id'] == area['regionId'] for region in metadata['regions']), npc_id)
            points = [point for point in metadata['locations'] if point.get('eventLayerMapId') == map_id]
            self.assertTrue(points, npc_id)
            for point in points:
                expected = project(point['worldPosition'], metadata['worldProjection'], metadata['bounds'])
                self.assertEqual((point['x'], point['y']), (expected['x'], expected['y']))
            if entrance['destinationId']:
                summary = index[entrance['destinationId']]
                destination = read(PUBLIC / 'data/reference' / summary['category'] /
                                   (summary['chunk'] + '.json'))['entries'][summary['id']]
                self.assertEqual(destination.get('eventArea'), area)
                related = destination.get('relatedInteriorMaps')
            else:
                related = entrance.get('relatedInteriorMaps')
            self.assertTrue(related, npc_id)
            activity = index[entrance['eventId']]['activity']
            image_id = related_image_by_family[(activity['familyId'], activity['faction'])]
            self.assertTrue(any(target['insetId'] == 'interior-' + str(image_id)
                                and target['insetId'] in {inset['id'] for inset in maps[target['mapId']]['insets']}
                                for target in related), npc_id)

    def test_shugo_interiors_include_named_citizens(self):
        for slug, inset in (('world-l-a', 'interior-500043'), ('world-d-a', 'interior-510038')):
            points = [point for point in read(PUBLIC / 'maps' / slug / 'metadata.json')['locations']
                      if point.get('insetId') == inset]
            self.assertTrue(any(point['name'] == 'First Shugo' and point['category'] == 'npc' for point in points))
            self.assertTrue(any(point['name'] == 'Second Shugo' and point['category'] == 'npc' for point in points))

    def test_world_event_layers_exclude_unclassified_environment_objects(self):
        for slug, map_id in (('world-l-a', 500008), ('world-d-a', 510007)):
            points = read(PUBLIC / 'maps' / slug / 'metadata.json')['locations']
            event_points = [point for point in points if point.get('eventLayerMapId') == map_id]
            self.assertEqual(len(event_points), 4)
            self.assertTrue(all(point['category'] == 'npc' for point in event_points))
            self.assertFalse(any(point['name'] == 'Light Pillar' for point in points))

    def test_event_spawns_outside_an_interior_image_use_the_parent_world_projection(self):
        audit = read(PUBLIC / 'data/reference/interior-map-audit.json')
        self.assertEqual(len(audit.get('worldSpillover', [])), 16)
        self.assertFalse(audit['unmappedPositions'])
        catalog = read(PUBLIC / 'data/event-entrances.json')['npcs']
        for map_id, slug in ((500042, 'world-l-a'), (510037, 'world-d-a')):
            metadata = read(PUBLIC / 'maps' / slug / 'metadata.json')
            points = [point for point in metadata['locations'] if point.get('eventLayerMapId') == map_id]
            self.assertEqual(len(points), 8)
            entrance = next(detail for detail in catalog.values() if detail['mapId'] == map_id)
            self.assertEqual(entrance['eventArea']['regionId'], 'event-layer-' + str(map_id))
            for point in points:
                expected = project(point['worldPosition'], metadata['worldProjection'], metadata['bounds'])
                self.assertEqual((point['x'], point['y']), (expected['x'], expected['y']))


if __name__ == '__main__':
    unittest.main()
