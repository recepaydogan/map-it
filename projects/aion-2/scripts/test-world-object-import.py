"""Regression coverage for alternative-spawn identity and independent checks."""
import importlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
objects = importlib.import_module('world-object-rewards')
pools = importlib.import_module('reward-pools')
world = importlib.import_module('world')
guides = importlib.import_module('dungeon-chest-guides')


class WorldObjectTests(unittest.TestCase):
    def test_guide_order_comes_from_event_steps_and_completion_requires_exact_target(self):
        ctx = SimpleNamespace(text=lambda key: key or '', labels={})
        objective = lambda name, optional=False: {'Type': 'UseEnvObj', 'Optional': optional,
                                                'value_list': [{'value': name}, {'value': '1'}]}
        clear = [{'Type': 'DungeonClear'}]
        event = {'Name': 'event', 'Stages': [{'Id': 1, 'Steps': [
            {'Id': 1, 'Desc': 'text_09', 'Objectives': [objective('final')], 'PostDirectives': clear},
            {'Id': 2, 'Desc': 'text_01', 'Objectives': [objective('other'), objective('door')], 'PostDirectives': clear},
            {'Id': 3, 'Desc': 'parent_summary', 'Objectives': [
                {'Type': 'ClearBoardPuzzle', 'ShowUI': True, 'Desc': 'puzzle', 'Optional': False}]},
            {'Id': 4, 'Desc': 'optional', 'Objectives': [dict(objective('optional', True), PostDirectives=clear)]},
        ]}]}
        guide = guides.event_guide(ctx, event, {'final': 'EnvObjData:1', 'other': 'EnvObjData:2', 'optional': 'EnvObjData:3'})
        self.assertEqual([ctx.labels[s['label'].removeprefix('reference.labels.')] for s in guide['steps']],
                         ['text_09', 'text_01', 'puzzle', 'optional'])
        self.assertEqual(guide['completionObjectIds'], ['EnvObjData:1'])

    def test_unkeyed_chests_keep_exact_rewards_and_do_not_borrow_missing_links(self):
        base = {'RequireType': 'EMonetaryType::None', 'bIsOptionalRequirement': False,
                'RequireCount': 0, 'RequireValues': [], 'bIsKeyOnly': False,
                'bGetRewardOnce': True, 'ResourceKey': 'RewardBox_04',
                'Usage': 'EEnvObjectUsage::Normal', 'bHideWorldMapMarker': False,
                'bHideMiniMapMarker': False, 'ObjectTerrainType': 'EObjectTerrainType::Ground',
                'InteractTime': 2500}
        rows = [dict(base, ID={'Value': i}, Name='object-' + str(i)) for i in (1, 2, 3)]
        rows[1]['Usage'] = 'EEnvObjectUsage::MapEvent'
        rows[2]['ResourceKey'] = 'Collectible_01'
        tables = {'EnvObjData': rows, 'RewardData': [{'ID': {'Value': 1}, 'RewardName': 'reward', 'BasicKeyRewards': []}],
                  'Item': [], 'Achievement': [], 'AchievementReward': [], 'RewardPackageItem': [], 'RewardPackage': [],
                  'RewardItem': [{'Name': 'reward', 'Race': 'ERace::All', 'Items': [
                      {'ItemName': 'item', 'ItemProb': 100000000, 'ItemCountMin': 300, 'ItemCountMax': 300}]}]}
        entries = {'EnvObjData:' + str(i): {'sections': []} for i in (1, 2, 3)}
        dungeon_contexts = [{'dungeonId': 'Dungeon:42', 'mapId': 'test-map', 'markerIds': ['chest']}]
        entries['EnvObjData:1']['rewardObject'] = {'dungeonContexts': dungeon_contexts}
        ctx = SimpleNamespace(rows=lambda name: tables[name], entries=entries,
                              item_links=lambda items: [{'id': '1', 'name': 'Item (Bound)', 'category': 'items'}] if items else [])
        objects.build(ctx)
        free = entries['EnvObjData:1']['rewardObject']
        self.assertEqual(free['access']['interactionSeconds'], 2.5)
        self.assertEqual(free['keys'], [])
        self.assertEqual(free['dungeonContexts'], dungeon_contexts)
        self.assertEqual(free['modes'][0]['kind'], 'normal')
        self.assertEqual(free['modes'][0]['items'][0]['rewardRates'][0]['quantityMin'], 300)
        self.assertTrue(entries['EnvObjData:2']['rewardObject']['access']['eventLinked'])
        self.assertEqual(entries['EnvObjData:2']['rewardObject']['modes'], [])
        self.assertNotIn('rewardObject', entries['EnvObjData:3'])
        before = json.dumps(entries, sort_keys=True)
        objects.build(ctx)
        self.assertEqual(json.dumps(entries, sort_keys=True), before)

    def test_identical_reward_rows_remain_two_checks(self):
        reward = {'ItemName': 'item', 'ItemProb': 50000000, 'ItemCountMin': 1, 'ItemCountMax': 1}
        tables = {'RewardPackageItem': [], 'RewardPackage': [],
                  'RewardItem': [{'Name': 'reward', 'Race': 'ERace::All', 'Items': [reward, reward]}]}
        ctx = SimpleNamespace(rows=lambda name: tables[name], item_links=lambda _: [{'id': '1', 'category': 'items', 'name': 'Item (Bound)'}])
        links = pools.RewardPools(ctx).links('reward', True, preserve_checks=True)
        self.assertEqual(len(links[0]['rewardRates']), 2)

    def test_merge_requires_same_actor_and_full_position_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            maps = root / 'maps/test-map'
            maps.mkdir(parents=True)
            exports = root / 'exports'
            exports.mkdir()
            definitions = [{'ID': {'Value': i}, 'RequireType': 'EMonetaryType::Item',
                            'bIsOptionalRequirement': True, 'RequireCount': 1, 'bIsKeyOnly': i == 2} for i in [1, 2]]
            point = lambda identity, entity, actor, z: {'id': identity, 'entityId': str(entity), 'name': 'Object',
                   'sourceActor': actor, 'reference': {'id': 'EnvObjData:' + str(entity), 'category': 'exploration'},
                   'worldPosition': {'X': 10, 'Y': 20, 'Z': z}, 'x': 10, 'y': 20}
            metadata = {'displayName': 'Test', 'locations': [point('keep', 1, 'actor', 0), point('alias', 2, 'actor', 0),
                        point('upstairs', 1, 'actor', 10), point('other-actor', 1, 'other', 0)]}
            (maps / 'metadata.json').write_text(json.dumps(metadata), encoding='utf8')
            data = {'asset': '/Data/Map/World/MapData.dat', 'data': {'Properties': {'Data': {'MapId': {'Value': 42},
                    'SpawnInfoList': [{'Name': actor, 'EnvObjIdList': [{'Value': 1}, {'Value': 2}]} for actor in ['actor', 'other']]}}}}
            (exports / 'map.json').write_text(json.dumps(data), encoding='utf8')
            entries = {'EnvObjData:' + str(i): {'id': 'EnvObjData:' + str(i), 'locations': []} for i in [1, 2]}
            entries['achievement'] = {'id': 'achievement', 'locations': [{'mapId': 'test-map', 'markerId': 'alias', 'name': 'Test'}]}
            ctx = SimpleNamespace(public=root, rows=lambda _: definitions, entries=entries)
            with patch.object(world, 'MAPS', [(42, 'test-map')]):
                objects.normalize_markers(ctx, exports)
                result = json.loads((maps / 'metadata.json').read_text('utf8'))
                self.assertEqual([p['id'] for p in result['locations']], ['keep', 'upstairs', 'other-actor'])
                self.assertEqual(result['locations'][0]['aliasIds'], ['alias'])
                self.assertEqual(entries['achievement']['locations'][0]['markerId'], 'keep')
                objects.normalize_markers(ctx, exports)
                self.assertEqual(result, json.loads((maps / 'metadata.json').read_text('utf8')))
                self.assertEqual(len(entries['EnvObjData:2']['locations']), 3)


if __name__ == '__main__':
    unittest.main()
