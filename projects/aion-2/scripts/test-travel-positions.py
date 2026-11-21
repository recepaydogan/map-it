"""Check exact actor joins, projection and repeatable source marker imports."""
import importlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
positions = importlib.import_module('travel-positions')


class TravelPositionsTests(unittest.TestCase):
    def test_exact_destinations_and_idempotent_departures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def write(relative, data):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(data), encoding='utf8')
            world = {'X': 100, 'Y': 200, 'Z': 30}
            write('maps/harbor/metadata.json', {'displayName': 'Harbor', 'bounds': {'minX': 0, 'minY': 0, 'maxX': 1000, 'maxY': 1000}, 'locations': []})
            write('tables/Map.json', {'Properties': {'Data': []}})
            write('tables/RiftData.json', {'Properties': {'Data': []}})
            write('world/world.json', {'asset': '/Data/WorldMap/Harbor.dat', 'data': {'Properties': {'Data': {
                'WorldMapDataTableKey': 'Harbor', 'StartWorldLocation': {'X': -500, 'Y': -500},
                'SectorSize': {'X': 1, 'Y': 1}, 'SectorWorldSize': 1000}}}})
            write('decoded/map.json', {'asset': '/Data/Map/Harbor/MapData.dat', 'data': {'Properties': {'Data': {
                'MapId': 1, 'SpawnInfoList': [{'Name': 'Gate', 'EnvObjIdList': [1], 'NpcIdList': [],
                    'Positions': [{'Location': {'X': -100, 'Y': -200, 'Z': 0}}]}],
                'TeleportDataMap': [{'Key': 'ExactActor', 'Value': {'Location': world}},
                                    {'Key': 'SimilarName', 'Value': {'Location': {'X': 0, 'Y': 0, 'Z': 0}}}]}}}})
            target = {'id': 'TeleportArtifact:1', 'category': 'travel', 'destination': {'mapId': 1, 'actor': 'ExactActor'}}
            unlinked = {'id': 'TeleportArtifact:2', 'category': 'travel', 'destination': {'mapId': 1, 'actor': 'Missing'}}
            source = {'id': 'EnvObjData:1', 'category': 'exploration', 'name': 'Gate', 'locations': [], 'sections': [
                {'title': 'reference.labels.related-content', 'links': [{'id': target['id'], 'category': 'travel'}]}]}
            entries = {entry['id']: entry for entry in (target, unlinked, source)}
            with patch.object(positions, 'MAPS', [(1, 'harbor', 'Harbor')]):
                result = positions.import_positions(entries, root, root / 'tables', root / 'decoded', root / 'world')
                self.assertEqual(result['addedMarkers'], 1)
                arrival = target['arrival']
                self.assertEqual(arrival['status'], 'resolved')
                self.assertEqual((arrival['points'][0]['x'], arrival['points'][0]['y']), (600, 700))
                self.assertEqual(unlinked['arrival']['status'], 'region-only')
                self.assertEqual(unlinked['arrival']['points'], [])
                marker_id = source['locations'][0]['markerId']
                source['locations'] = []  # A full reference rebuild starts with fresh entries.
                repeated = positions.import_positions(entries, root, root / 'tables', root / 'decoded', root / 'world')
                self.assertEqual(repeated['addedMarkers'], 0)
                self.assertEqual(source['locations'][0]['markerId'], marker_id)

    def test_published_arrivals_match_source_projection(self):
        public = Path(__file__).parent.parent / 'public'
        maps = {p.parent.name: json.loads(p.read_text('utf8')) for p in (public / 'maps').glob('*/metadata.json')}
        checked = 0
        for path in (public / 'data/reference/travel').glob('*.json'):
            for entry in json.loads(path.read_text('utf8'))['entries'].values():
                arrival = entry.get('arrival')
                self.assertIsNotNone(arrival, entry['id'])
                if arrival['status'] != 'resolved':
                    continue
                metadata = maps[arrival['mapId']]
                projection = next((inset for inset in metadata.get('insets', []) if inset['id'] == arrival.get('insetId')), metadata)
                self.assertTrue(arrival['points'])
                for point in arrival['points']:
                    expected = positions.project(point['world'], projection['worldProjection'], projection['bounds'])
                    self.assertEqual((point['x'], point['y']), (expected['x'], expected['y']))
                    self.assertIn(point['actor'], [a.strip() for a in entry['destination']['actor'].split(',')])
                    self.assertTrue(point['source'].endswith('/MapData.dat'))
                checked += 1
        self.assertGreater(checked, 0)


if __name__ == '__main__':
    unittest.main()
