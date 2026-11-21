"""Verify reciprocal travel markers, safe name recovery and published coverage."""
import copy
import importlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
travel = importlib.import_module('travel-network')


class TravelNetworkTests(unittest.TestCase):
    def test_departures_are_not_inferred_from_names_or_destinations(self):
        target = {'id': 'NpcTeleport:1', 'category': 'travel', 'name': 'Harbor', 'description': 'Visit the harbor.', 'facts': [], 'sections': [], 'locations': [], 'destination': {'mapId': 2, 'actor': 'Arrival'}}
        source = {'id': 'NpcData:1', 'category': 'creatures', 'sections': [{'title': 'reference.labels.destinations', 'links': [{'id': target['id'], 'category': 'travel'}]}]}
        entries = {entry['id']: entry for entry in (target, source)}
        maps = {'departure': {'displayName': 'Departure', 'locations': [{'id': 'tower', 'name': 'Tower', 'category': 'teleport', 'reference': {'id': source['id']}}]},
                'arrival': {'displayName': 'Arrival', 'locations': [{'id': 'unlinked', 'name': 'Harbor', 'category': 'teleport', 'sourceActor': 'Arrival'}]}}
        audit = travel.enrich(entries, maps)
        self.assertEqual(target['locations'], [{'mapId': 'departure', 'markerId': 'tower', 'name': 'Departure · Tower'}])
        self.assertEqual(audit['unresolvedMarkers'], [{'mapId': 'arrival', 'markerId': 'unlinked'}])

    def test_only_explicit_destination_text_recovers_technical_names(self):
        entries = {f'TeleportArtifact:{i}': {'id': f'TeleportArtifact:{i}', 'category': 'travel', 'name': f'Teleport Artifact {i}', 'facts': [], 'sections': [], 'description': description, 'locations': []}
                   for i, description in enumerate(('Instantly teleport to Harbor in Northern Reach.', 'Internal reference object.'))}
        travel.enrich(entries, {})
        self.assertEqual(entries['TeleportArtifact:0']['name'], 'Harbor in Northern Reach')
        self.assertFalse(entries['TeleportArtifact:0']['unnamed'])
        self.assertTrue(entries['TeleportArtifact:1']['unnamed'])
        self.assertFalse(entries['TeleportArtifact:0']['travel']['hasMarker'])

    def test_published_markers_and_summaries_are_reciprocal(self):
        public = Path(__file__).parent.parent / 'public'
        root = public / 'data/reference'
        entries = {}
        for category in ('travel', 'creatures', 'exploration'):
            for path in (root / category).glob('*.json'):
                entries.update(json.loads(path.read_text('utf8'))['entries'])
        maps = {p.parent.name: json.loads(p.read_text('utf8')) for p in (public / 'maps').glob('*/metadata.json')}
        before = copy.deepcopy(entries)
        audit = travel.enrich(entries, maps)
        self.assertEqual(audit['unresolvedMarkers'], [], 'Every shipped travel marker must expose travel details')
        self.assertEqual(audit, json.loads((root / 'travel-audit.json').read_text('utf8')))
        self.assertGreater(audit['markers'], 0)
        summaries = {e['id']: e for e in json.loads((root / 'index.json').read_text('utf8'))['entries']}
        for key, entry in entries.items():
            if entry['category'] != 'travel':
                continue
            self.assertEqual(entry, before[key], f'Stale published travel entry: {key}')
            self.assertEqual(entry['travel'], summaries[key]['travel'])
            self.assertEqual(entry['name'], summaries[key]['name'])
            for location in entry['locations']:
                marker = next(p for p in maps[location['mapId']]['locations'] if p['id'] == location['markerId'])
                source = entries[marker['reference']['id']]
                self.assertIn(key, [target['id'] for target in travel.linked_travel(source, entries)])
        self.assertTrue(any(e['id'].startswith('NpcTeleport:') and e['locations'] for e in entries.values()))


if __name__ == '__main__':
    unittest.main()
