"""Verify box identity, reward semantics and direct-link preservation."""
from copy import deepcopy
import importlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
boxes = importlib.import_module('box-catalog')
P = 'reference.labels.'


def item(id, name='Supply Chest', **extra):
    return {'id': id, 'name': name, 'nameVerified': True, 'grade': 'Common', **extra}


def link(id, quantity=1):
    return {'id': id, 'name': id, 'category': 'items', 'quantity': quantity}


def entry(id, rewards, faction='All', class_name='All', kind='contents', **extra):
    return {'id': id, 'name': 'Supply Chest', 'facts': [
        {'label': P + 'faction', 'value': faction}, {'label': P + 'class', 'value': class_name},
        {'label': P + 'minimum-level', 'value': 1}, {'label': P + 'maximum-level', 'value': 100}],
        'sections': [{'title': P + kind, 'links': rewards}], **extra}


def owners(mapping):
    return {id: [{'title': P + 'box-contents', 'links': [
        {'id': box, 'category': 'boxes', 'name': 'Supply Chest'} for box in ids]}] for id, ids in mapping.items()}


class BoxCatalogTest(unittest.TestCase):
    def build(self, items, entries, sections, acquisition=None):
        return boxes.build_catalog({i['id']: i for i in items}, {e['id']: e for e in entries}, sections, acquisition or {})['families']

    def test_same_item_variants_keep_distinct_contents(self):
        result = self.build([item('box')], [entry('b1', [link('sword')], class_name='Warrior'),
            entry('b2', [link('staff')], class_name='Mage')], owners({'box': ['b1', 'b2']}))
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]['variants']), 2)
        self.assertNotEqual(result[0]['variants'][0]['sections'], result[0]['variants'][1]['sections'])

    def test_names_alone_never_merge_boxes(self):
        result = self.build([item('a'), item('b')], [entry('a1', [link('reward', 1)]), entry('b1', [link('reward', 2)])], owners({'a': ['a1'], 'b': ['b1']}))
        self.assertEqual(len(result), 2)

    def test_equivalent_boxes_merge_but_different_binding_does_not(self):
        items = [item('a'), item('b')]
        entries = [entry('a1', [link('reward')]), entry('b1', [link('reward')])]
        sections = owners({'a': ['a1'], 'b': ['b1']})
        self.assertEqual(len(self.build(items, entries, sections)), 1)
        self.assertEqual(len(self.build([items[0], {**items[1], 'binding': 'Soul Bind'}], entries, sections)), 2)

    def test_nested_packages_preserve_faction_and_multiply_quantities(self):
        items = [item('parent'), item('internal', nameVerified=False)]
        entries = [entry('p', [link('internal', 2)], faction='Light'),
                   entry('l', [link('light-reward', 3)], faction='Light'), entry('d', [link('dark-reward', 4)], faction='Dark')]
        sections = owners({'parent': ['p'], 'internal': ['l', 'd']})
        original = deepcopy(entries)
        family = next(f for f in self.build(items, entries, sections) if f['id'] == 'p')
        self.assertEqual(family['variants'][0]['sections'][0]['links'], [link('light-reward', 6)])
        self.assertTrue(family['variants'][0]['flattened'])
        self.assertEqual(entries, original)

    def test_random_choices_and_ambiguous_children_remain_containers(self):
        for kind in ('choose-a-reward', 'possible-contents'):
            with self.subTest(kind=kind):
                family = next(f for f in self.build([item('parent'), item('internal', nameVerified=False)],
                    [entry('p', [link('internal')]), entry('c', [link('reward')], kind=kind)],
                    owners({'parent': ['p'], 'internal': ['c']})) if f['id'] == 'p')
                self.assertFalse(family['variants'][0]['flattened'])
                self.assertEqual(family['variants'][0]['sections'][0]['links'][0]['category'], 'boxes')
        family = next(f for f in self.build([item('parent'), item('internal', nameVerified=False)],
            [entry('p', [link('internal')]), entry('l', [link('reward')], faction='Light')],
            owners({'parent': ['p'], 'internal': ['l']})) if f['id'] == 'p')
        self.assertFalse(family['variants'][0]['flattened'])

    def test_named_chests_remain_navigable(self):
        family = next(f for f in self.build([item('parent'), item('chest', 'Named Chest')],
            [entry('p', [link('chest')]), entry('c', [link('reward')])],
            owners({'parent': ['p'], 'chest': ['c']})) if f['id'] == 'p')
        self.assertFalse(family['variants'][0]['flattened'])
        self.assertEqual(family['variants'][0]['sections'][0]['links'][0]['id'], 'c')

    def test_cycles_terminate_without_losing_links(self):
        result = self.build([item('a', nameVerified=False), item('b', nameVerified=False)],
            [entry('a1', [link('b')]), entry('b1', [link('a')])], owners({'a': ['a1'], 'b': ['b1']}))
        self.assertTrue(all(f['variants'][0]['sections'][0]['links'] for f in result))

    def test_unverified_and_test_records_are_hidden_without_inventing_sources(self):
        result = self.build([item('a', nameVerified=False), item('b', 'Weapon Chest: Test'), item('c', 'Unmapped Chest')],
            [entry('a1', [link('r1')]), entry('b1', [link('r2')]), entry('c1', [link('r3')])],
            owners({'a': ['a1'], 'b': ['b1'], 'c': ['c1']}))
        self.assertEqual(sum(f['technical'] for f in result), 2)
        self.assertTrue(all(f['kind'] == 'unknown' for f in result))

    def test_probabilities_survive_unchanged(self):
        reward = {**link('reward'), 'rewardRates': [{'kind': 'pool', 'percent': 25, 'poolPercent': 10, 'poolCount': 2, 'quantityMin': 1, 'quantityMax': 3}]}
        result = self.build([item('box')], [entry('b', [reward], kind='possible-contents')], owners({'box': ['b']}))
        self.assertEqual(result[0]['variants'][0]['sections'][0]['links'][0]['rewardRates'], reward['rewardRates'])

    def test_acquisition_follows_internal_packages_to_named_sources(self):
        sections = owners({'parent': ['p'], 'internal': ['i'], 'chest': ['c']})
        sections['internal'].append({'title': P + 'additional-acquisition-sources', 'links': [{'id': 'p', 'category': 'boxes', 'name': 'Starter Founders Pack'}]})
        sections['chest'].append({'title': P + 'additional-acquisition-sources', 'links': [{'id': 'i', 'category': 'boxes', 'name': 'Internal'}]})
        families = self.build([item('parent', "Starter Founder's Pack"), item('internal', 'Internal', nameVerified=False), item('chest', 'Campaign Chest')],
            [entry('p', [link('internal')]), entry('i', [link('chest')]), entry('c', [link('reward')])], sections)
        chest = next(f for f in families if f['id'] == 'c')
        self.assertEqual([s['id'] for s in chest['sources']], ['p'])
        self.assertEqual(chest['kind'], 'store')

    def test_published_catalog_covers_every_raw_id_and_all_links_resolve(self):
        root = Path(__file__).parent.parent / 'public/data/reference'
        index = json.loads((root / 'index.json').read_text('utf8'))
        reference_ids = {e['id'] for e in index['entries']}
        item_ids = {i['id'] for i in json.loads((root.parent / 'items/catalog.json').read_text('utf8'))['items']}
        summaries = json.loads((root / 'box-catalog.json').read_text('utf8'))['families']
        family_ids = {s['id'] for s in summaries}
        raw_ids = [id for s in summaries for id in s['variantIds']]
        self.assertEqual(len(raw_ids), len(set(raw_ids)))
        self.assertEqual(set(raw_ids), {e['id'] for e in index['entries'] if e['category'] == 'boxes'})
        for summary in summaries:
            family = json.loads((root / 'box-details' / (summary['chunk'] + '.json')).read_text('utf8'))['families'][summary['id']]
            self.assertEqual(summary['variantIds'], [v['id'] for v in family['variants']])
            links = family['items'] + family['sources'] + [l for v in family['variants'] for s in v['sections'] for l in s.get('links', [])]
            for link_ in links:
                targets = item_ids if link_['category'] == 'items' else family_ids if link_['category'] == 'boxes' else reference_ids
                self.assertIn(link_['id'], targets)
        self.assertLess((root / 'box-catalog.json').stat().st_size, 150_000)


if __name__ == '__main__':
    unittest.main()
