"""Exclude random-only quest rewards from item acquisition recommendations."""
from collections import defaultdict
from importlib import import_module
from context import value

SOURCE_TABLES = ('Item', 'Quest', 'QuestReward', 'QuestClassReward',
                 'RewardItem', 'RewardPackage', 'RewardPackageItem')
SOURCE_SECTION = 'reference.labels.additional-acquisition-sources'


def random_only_pairs(ctx):
    rewards = defaultdict(list)
    for table in ('QuestReward', 'QuestClassReward'):
        for row in ctx.rows(table):
            rewards[row['Group']].append(row)
    pools = import_module('reward-pools').RewardPools(ctx)
    resolved = {}
    excluded = set()
    for quest in ctx.rows('Quest'):
        quest_id = str(value(quest['ID']))
        fixed, random = set(), set()
        for reward in rewards[quest_id] + rewards[quest['Name']]:
            fixed.update(link['id'] for link in ctx.item_links(
                reward.get('ItemRewards', []) + reward.get('ItemNormalRewards', [])
                + reward.get('ItemSelectRewards', [])))
            name = reward.get('RandomReward')
            if not name or name == 'None':
                continue
            if name not in resolved:
                if name not in pools.items and name not in pools.groups:
                    raise ValueError(f'Unresolved random quest reward: {name}')
                resolved[name] = {link['id'] for link in pools.links(name)}
            random.update(resolved[name])
        excluded.update((item_id, 'Quest:' + quest_id) for item_id in random - fixed)
    return excluded


def remove_sources(items, excluded):
    removed = 0
    for item_id, sections in items.items():
        retained = []
        for section in sections:
            if section['title'] != SOURCE_SECTION:
                retained.append(section)
                continue
            links = section.get('links', [])
            filtered = [link for link in links if link['category'] != 'quests'
                        or (item_id, link['id']) not in excluded]
            removed += len(links) - len(filtered)
            if len(filtered) == len(links):
                retained.append(section)
            elif filtered or any(section.get(key) for key in ('text', 'facts', 'rows', 'summary')):
                retained.append({**section, 'links': filtered})
        sections[:] = retained
    return removed
