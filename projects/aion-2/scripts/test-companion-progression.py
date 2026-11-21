"""Regression checks for companion joins, shared progression and published coverage."""
import copy
import importlib
import json
import sys
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context
builder = importlib.import_module('companion-progression')


class CompanionProgressionTests(unittest.TestCase):
    def test_published_coverage(self):
        root = Path(__file__).parent.parent / 'public/data/reference'
        data = json.loads((root / 'companion-progression.json').read_text('utf8'))
        index = json.loads((root / 'index.json').read_text('utf8'))
        pets = [entry for entry in index['entries'] if entry['category'] == 'mounts']
        self.assertEqual(set(data['pets']), {entry['id'] for entry in pets})
        locale = json.loads((root.parents[2] / 'src/i18n/locales/en.json').read_text('utf8'))
        for rows in data['statGroups'].values():
            for row in rows:
                for fact in row['stats']:
                    translated = locale
                    for key in fact['label'].split('.'):
                        translated = translated[key]
                    self.assertIsInstance(translated, str)
        for summary in pets:
            chunk = json.loads((root / 'mounts' / (summary['chunk'] + '.json')).read_text('utf8'))
            entry = chunk['entries'][summary['id']]
            self.assertEqual(entry['group'], summary['group'])
            if summary.get('icon'):
                self.assertEqual(entry['icon'], summary['icon'])
                self.assertTrue((root.parents[1] / summary['icon']).is_file())
        self.assertEqual(len(data['genera']), 5)
        for genus in data['genera'].values():
            self.assertEqual([row['level'] for row in genus['levels']], list(range(1, 11)))
            for row in genus['levels']:
                self.assertAlmostEqual(sum(grade['percent'] for grade in row['grades']), 100)
        for pet in data['pets'].values():
            self.assertIn(pet['genus'], data['genera'])
            if pet['statGroup']:
                self.assertIn(pet['statGroup'], data['statGroups'])
            self.assertGreater(pet['runSpeed'], 0)
            self.assertGreaterEqual(pet['sprintSpeed'], pet['runSpeed'])
        feral = data['statGroups']['Feral_01'][-1]
        self.assertEqual(feral['level'], 3)
        self.assertEqual({fact['label']: fact['value'] for fact in feral['stats']}, {
            'reference.labels.mount-ground-move-speed': 3,
            'reference.labels.accuracy-bonus': 2,
            'reference.labels.dexterity': 1,
        })

    def test_explicit_group_join_and_repeatability(self):
        with tempfile.TemporaryDirectory() as directory:
            ctx = Context.__new__(Context)
            ctx.public = Path(directory)
            ctx.labels, ctx.strings, ctx.items, ctx.item_names = {}, {}, {}, {}
            ctx.warnings = defaultdict(int)
            ctx.entries = {'VehicleList:1': {'facts': []}, 'VehicleList:2': {'facts': []}}
            ctx.cache = {
                'VehicleList': [
                    {'ID': {'Value': identity}, 'CreatureType': 'Genus', 'StatGroupName': group,
                     'ArtRunSpeed': 900, 'ArtSprintSpeed': 1200, 'VehicleItemName': 'None'}
                    for identity, group in [(1, 'Group'), (2, 'None')]
                ],
                'VehicleStat': [
                    {'Group': 'Unrelated', 'Level': 1, 'StatList': [{'StatType': 'INT', 'StatValue': 999}]},
                    {'Group': 'Group', 'Level': 2, 'StatList': [{'StatType': 'DEX', 'StatValue': 2}]},
                    {'Group': 'Group', 'Level': 1, 'StatList': [{'StatType': 'DEX', 'StatValue': 1}]},
                ],
                'VehicleLevel': [{'Level': 1, 'NeedSoulCount': 25, 'GetCreatureExp': 500}],
                'VehicleCreatureSlot': [{'CreatureType': 'Genus', 'SlotOpenLevel': [1, 3], 'SoulCrystalCount': 5, 'GoldCount': 1000}],
                'VehicleCreatureLevel': [{'CreatureType': 'Genus', 'Level': 1, 'NeedExp': 500, 'GetExp': 100, 'Prob_Common': 9000, 'Prob_Rare': 1000}],
            }
            first = builder.build(ctx)
            self.assertEqual(first['pets']['VehicleList:1']['statGroup'], 'Group')
            self.assertIsNone(first['pets']['VehicleList:2']['statGroup'])
            self.assertEqual([row['level'] for row in first['statGroups']['Group']], [1, 2])
            self.assertEqual(first['genera']['Genus']['levels'][0]['grades'][1]['percent'], 10)
            before = copy.deepcopy(ctx.entries)
            self.assertEqual(first, builder.build(ctx))
            self.assertEqual(before, ctx.entries)
            ctx.cache['VehicleList'][0]['StatGroupName'] = 'Missing'
            with self.assertRaisesRegex(ValueError, 'Missing companion stat group'):
                builder.build(ctx)


if __name__ == '__main__':
    unittest.main()
