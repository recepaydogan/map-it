"""Check descriptive set names without changing official names or unrelated items."""
import importlib
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
name_set_items = importlib.import_module('set-item-names').name_set_items


class SetItemNamesTest(unittest.TestCase):
    def test_verified_names_and_unrelated_items_are_preserved(self):
        items = {
            '1': {'name': 'Internal A 002 b', 'nameVerified': False, 'category': 'Ring'},
            '2': {'name': 'Official Ring', 'nameVerified': True, 'category': 'Ring'},
            '3': {'name': 'Unrelated', 'nameVerified': False, 'category': 'Ring'},
        }
        entries = [{'category': 'sets', 'name': 'Guardian', 'sections': [{
            'title': 'reference.labels.set-pieces',
            'links': [{'category': 'items', 'id': '1'}, {'category': 'items', 'id': '2'}],
        }]}]
        self.assertEqual(name_set_items(items, entries), {'1'})
        self.assertEqual(items['1']['name'], 'Guardian · Ring')
        self.assertFalse(items['1']['nameVerified'])
        self.assertEqual(items['1']['nameOrigin'], 'set')
        self.assertEqual(items['2']['name'], 'Official Ring')
        self.assertEqual(items['3']['name'], 'Unrelated')
        name_set_items(items, entries + entries)
        self.assertEqual(items['1']['name'], 'Guardian · Ring')


if __name__ == '__main__':
    unittest.main()
