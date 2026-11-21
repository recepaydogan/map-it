"""Verify random-only exclusions without losing fixed rewards or item identities."""
import argparse
from collections import defaultdict
from copy import deepcopy
import importlib
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
from context import Context
rules = importlib.import_module('random-quest-sources')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tables')
parser.add_argument('--localization')
args, remaining = parser.parse_known_args()
ROOT = Path(__file__).parent.parent / 'public'


def fixture():
    ctx = Context.__new__(Context)
    ctx.warnings, ctx.item_sections = defaultdict(int), defaultdict(list)
    ctx.labels = {}
    ctx.items = {key: {'id': key, 'name': 'Material' if key in ('random', 'bound') else key}
                 for key in ('random', 'bound', 'fixed', 'choice', 'class-fixed', 'disabled')}
    ctx.item_names = {key: key for key in ctx.items}
    ctx.entries = {'Quest:1': {'id': 'Quest:1', 'category': 'quests', 'name': 'Quest'}}
    ctx.aliases = {('Quest', '1'): 'Quest:1'}
    ctx.cache = {
        'Quest': [{'ID': {'Value': 1}, 'Name': 'quest-one'}],
        'QuestReward': [{'Group': '1', 'ItemRewards': [{'Item': 'fixed', 'Count': 1},
                                                     {'Item': 'bound', 'Count': 1}],
                         'ItemSelectRewards': [{'Item': 'choice', 'Count': 1}],
                         'RandomReward': 'random-group'}],
        'QuestClassReward': [{'Group': 'quest-one', 'Class': 'ECharacterClass::Warrior',
                              'ItemNormalRewards': [{'Item': 'class-fixed', 'Count': 1}],
                              'RandomReward': 'None'}],
        'RewardPackage': [{'Name': 'random-group', 'Race': 'ERace::All',
                           'PackageItems': [{'Item': 'pool', 'Prob': 100000000, 'Count': 1}]}],
        'RewardPackageItem': [{'PackageName': 'pool', 'Items': [
            {'ItemName': key, 'ItemProb': 0 if key == 'disabled' else 1000000,
             'ItemCountMin': 1, 'ItemCountMax': 1} for key in ctx.items if key != 'bound']}],
        'RewardItem': [], 'GameShopGoods': [],
    }
    return ctx


class RandomQuestSourcesTest(unittest.TestCase):
    def test_fixed_selection_and_class_rewards_override_random_membership(self):
        self.assertEqual(rules.random_only_pairs(fixture()), {('random', 'Quest:1')})

    def test_guaranteed_pool_roll_does_not_guarantee_an_individual_item(self):
        ctx = fixture()
        self.assertEqual(ctx.cache['RewardPackage'][0]['PackageItems'][0]['Prob'], 100000000)
        self.assertIn(('random', 'Quest:1'), rules.random_only_pairs(ctx))
        self.assertNotIn(('bound', 'Quest:1'), rules.random_only_pairs(ctx))

    def test_missing_pool_fails_instead_of_silently_leaving_recommendations(self):
        ctx = fixture()
        ctx.cache['QuestReward'][0]['RandomReward'] = 'missing'
        with self.assertRaisesRegex(ValueError, 'Unresolved random quest reward'):
            rules.random_only_pairs(ctx)

    def test_direct_random_table_is_excluded_too(self):
        ctx = fixture()
        ctx.cache['RewardPackage'] = []
        ctx.cache['RewardItem'] = [{'Name': 'random-group', 'Race': 'ERace::All',
                                    'Items': ctx.cache['RewardPackageItem'][0]['Items']}]
        self.assertEqual(rules.random_only_pairs(ctx), {('random', 'Quest:1')})

    def test_cleanup_preserves_other_sources_and_is_repeatable(self):
        quest = {'id': 'Quest:1', 'category': 'quests', 'name': 'Quest'}
        recipe = {'id': 'ConversionRecipe:1', 'category': 'recipes', 'name': 'Recipe'}
        section = {'title': rules.SOURCE_SECTION, 'links': [quest, recipe]}
        unrelated = {'title': 'reference.labels.used-in-recipes', 'links': [recipe]}
        items = {'random': [deepcopy(section), unrelated], 'bound': [deepcopy(section)],
                 'only-random': [{'title': rules.SOURCE_SECTION, 'links': [quest]}]}
        bound = deepcopy(items['bound'])
        excluded = {('random', 'Quest:1'), ('only-random', 'Quest:1')}
        self.assertEqual(rules.remove_sources(items, excluded), 2)
        self.assertEqual(items['random'], [{'title': rules.SOURCE_SECTION, 'links': [recipe]}, unrelated])
        self.assertEqual(items['bound'], bound)
        self.assertEqual(items['only-random'], [])
        self.assertEqual(rules.remove_sources(items, excluded), 0)

    def test_importer_does_not_reintroduce_excluded_routes(self):
        ctx = fixture()
        empty = {key: [] for key in ('MonsterGetRoutes', 'AchievementInfo', 'ConversionRecipeGetRoutes',
                 'PartyDungeonGetRoutes', 'RaidInfo', 'PeriodCollectionInfo', 'DecomposeItemInfos',
                 'AwakenInfo', 'DailyInfo', 'FieldEventInfo', 'RankingInfo', 'MonolithInfo')}
        empty.update({key: {} for key in ('ExplorationSealInfo', 'ExplorationGarrisionInfo', 'RewardBoxInfo')})
        ctx.cache['ItemGetRoute'] = [{**empty, 'ItemId': {'Value': key},
                                     'QuestGetRoutes': [{'QuestId': {'Value': 1}}]}
                                    for key in ('random', 'fixed', 'choice', 'bound', 'class-fixed')]
        importlib.import_module('activities').sources(ctx)
        self.assertNotIn('random', ctx.item_sections)
        for key in ('fixed', 'choice', 'bound', 'class-fixed'):
            self.assertEqual(ctx.item_sections[key][0]['links'][0]['id'], 'Quest:1')

    def test_published_sources(self):
        items = {key: val for path in (ROOT / 'data/reference/items').glob('*.json')
                 for key, val in json.loads(path.read_text('utf8'))['items'].items()}
        def sources(item_id):
            return [link for section in items[item_id] if section['title'] == rules.SOURCE_SECTION
                    for link in section.get('links', []) if link['category'] == 'quests']
        self.assertEqual(sources('610660035'), [])
        self.assertIn('Quest:1302010', {link['id'] for link in sources('930100001')})
        self.assertIn('Quest:1302010', {link['id'] for link in sources('930100003')})
        self.assertIn('Quest:1101011', {link['id'] for link in sources('210160026')})
        if args.tables or args.localization:
            self.assertTrue(args.tables and args.localization, 'Supply both source arguments')
            ctx = Context(args.tables, args.localization, ROOT)
            self.assertEqual(rules.remove_sources(items, rules.random_only_pairs(ctx)), 0)


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0], *remaining])
