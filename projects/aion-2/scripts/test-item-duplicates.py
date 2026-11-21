"""Check item-list deduplication without changing source identities or data."""
import copy
import importlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
duplicates = importlib.import_module('duplicate-items')


def item(identity, category='Material', **extra):
    return {'id': identity, 'name': 'Sample item', 'category': category,
            'grade': 'Common', 'nameVerified': True, 'sections': [],
            'enhancements': [], 'source': 'Item.dat#' + identity, **extra}


def section(title, **content):
    return {'title': 'reference.labels.' + title, **content}


class ItemDuplicatesTest(unittest.TestCase):
    def classify(self, items, sections=None, acquisition=None):
        self.catalog = {'items': items, 'recipes': []}
        return duplicates.mark_duplicates(self.catalog, sections or {}, acquisition or {})

    def test_more_complete_sources_win_in_every_category(self):
        for category in ['Weapon', 'Armor', 'Material', 'Ticket', 'Chest', 'Scroll']:
            with self.subTest(category=category):
                self.assertEqual(self.classify([item('1', category), item('2', category)],
                    acquisition={'2': {'drops': [{'name': 'Boss'}]}}), {'1': '2'})

    def test_source_superset_wins_even_when_both_are_nonempty(self):
        sources = {'1': {'drops': [{'name': 'Boss'}]},
                   '2': {'drops': [{'name': 'Boss'}, {'name': 'Enemy'}]}}
        self.assertEqual(self.classify([item('1'), item('2')], acquisition=sources), {'1': '2'})

    def test_different_sources_are_not_lost(self):
        self.assertEqual(self.classify([item('1'), item('2')], acquisition={
            '1': {'drops': [{'name': 'Boss'}]}, '2': {'merchants': [{'name': 'Shop'}]}}), {})

    def test_binding_keeps_variants_distinct(self):
        self.assertEqual(self.classify([item('1', binding='Soul Bind'), item('2', binding='Exchangeable')]), {})

    def test_missing_descriptions_and_reference_data_prefer_complete_item(self):
        self.assertEqual(self.classify([item('1'), item('2', description='Description')], {
            '2': [section('use-effect', facts=[{'label': 'Effect', 'value': 'Restore'}])],
        }), {'1': '2'})

    def test_stats_levels_effects_and_categories_remain_distinct(self):
        for extra in [{'itemLevel': 20}, {'usageLevel': 20}, {'category': 'Other'},
                      {'grade': 'Rare'}, {'description': 'Other effect'}]:
            with self.subTest(extra=extra):
                first = item('1', itemLevel=10, usageLevel=10, description='Original effect')
                second = {**first, 'id': '2', **extra}
                self.assertEqual(self.classify([first, second]), {})
        # The same set of numbers assigned to different stats is not equivalent.
        first = item('1', sections=[{'key': 'base', 'stats': [{'key': 'attack', 'value': 1}, {'key': 'defense', 'value': 2}]}])
        second = item('2', sections=[{'key': 'base', 'stats': [{'key': 'attack', 'value': 2}, {'key': 'defense', 'value': 1}]}])
        self.assertEqual(self.classify([first, second]), {})
        self.assertEqual(self.classify([item('1'), item('2')], {
            '1': [section('use-effect', links=[{'id': 'Skill:1'}])],
            '2': [section('use-effect', links=[{'id': 'Skill:2'}])],
        }), {})

    def test_provenance_order_and_empty_fields_do_not_create_duplicates(self):
        first = item('1', enhancements=[{'level': 1, 'source': 'A'}])
        second = item('2', enhancements=[{'level': 1, 'source': 'B'}], description='')
        self.assertEqual(self.classify([second, first]), {'2': '1'})

    def test_aliases_are_direct_deterministic_and_idempotent(self):
        items = [item('1'), item('2'), item('3', description='Full')]
        original = copy.deepcopy(items)
        result = self.classify(items)
        self.assertEqual(result, {'1': '3', '2': '3'})
        self.assertEqual(duplicates.mark_duplicates(self.catalog, {}, {}), result)
        for before, after in zip(original, items):
            self.assertEqual(before, {key: value for key, value in after.items() if key != 'duplicateOf'})

    def test_unverified_and_hidden_variants_are_not_redirected(self):
        self.assertEqual(self.classify([item('1'), item('2', nameVerified=False),
                                       item('3', hiddenFromList=True)]), {})

    def test_explicitly_listed_item_keeps_its_own_detail_route(self):
        self.assertEqual(self.classify([item('1'), item('2', preserveInList=True)]), {})

    def test_published_aliases_match_the_policy(self):
        public = Path(__file__).resolve().parent.parent / 'public'
        catalog = json.loads((public / 'data/items/catalog.json').read_text('utf8'))
        items = {entry['id']: entry for entry in catalog['items']}
        expected = duplicates.annotate_catalog(None, public, dry_run=True)
        actual = {entry['id']: entry['duplicateOf'] for entry in items.values() if entry.get('duplicateOf')}
        self.assertEqual(actual, expected)
        for identity, target in actual.items():
            self.assertNotEqual(identity, target)
            self.assertNotIn('duplicateOf', items[target])
            self.assertFalse(items[target].get('hiddenFromList'))
            for key in ['name', 'category', 'grade']:
                self.assertEqual(items[identity][key], items[target][key])


if __name__ == '__main__':
    unittest.main()
