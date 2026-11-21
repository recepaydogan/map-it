"""Validate published directional portals against explicit source identities."""
import importlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
portal = importlib.import_module('portal-routes')


class PortalRoutesTests(unittest.TestCase):
    def test_import_rejects_a_missing_teleport_instead_of_guessing(self):
        class Context:
            def rows(self, name):
                return [{'Usage': 'Type::MoveMap', 'Name': 'Portal', 'UsageValue': 'Missing'}] if name == 'EnvObjData' else []
        with self.assertRaisesRegex(ValueError, 'Unresolved portal target'):
            portal.build(Context())

    def test_published_bidirectional_portals_keep_their_distinct_targets(self):
        root = Path(__file__).parent.parent / 'public'
        entries = {}
        for path in (root / 'data/reference/travel').glob('*.json'):
            entries.update(json.loads(path.read_text('utf8'))['entries'])
        fixtures = [
            (1100489, 'world-l-a', 'world-l-b', 295, 'Arrive_Eltnen_Portal'),
            (1100490, 'world-l-b', 'world-l-a', 296, 'Arrive_Verteron_Portal'),
            (1100487, 'world-d-a', 'world-d-b', 167, 'Tel_Enter_Morheim'),
            (1100488, 'world-d-b', 'world-d-a', 128, 'Tel_Enter_Altgard'),
        ]
        for env_id, source_map, target_map, teleport_id, actor in fixtures:
            with self.subTest(env_id=env_id):
                entry = entries[f'EnvObjData:{env_id}']
                self.assertEqual(entry['travel']['kind'], 'portal')
                self.assertEqual(entry['route']['teleportId'], teleport_id)
                self.assertEqual(entry['destination']['actor'], actor)
                self.assertEqual({p['mapId'] for p in entry['locations']}, {source_map})
                self.assertEqual(entry['arrival']['mapId'], target_map)
                self.assertEqual(entry['arrival']['status'], 'resolved')
                self.assertTrue(entry['arrival']['points'])
                map_data = json.loads((root / 'maps' / source_map / 'metadata.json').read_text('utf8'))
                marker = next(p for p in map_data['locations'] if p['id'] == entry['locations'][0]['markerId'])
                self.assertEqual(marker['category'], 'portal')
                self.assertEqual(marker['reference'], {'id': entry['id'], 'category': 'travel'})


if __name__ == '__main__':
    unittest.main()
