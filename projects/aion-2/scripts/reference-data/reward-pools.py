"""Resolve reward pools without losing individual and conditional item rates."""
from collections import defaultdict


class RewardPools:
    def __init__(self, ctx):
        self.ctx = ctx
        self.packages = {row['PackageName']: row['Items'] for row in ctx.rows('RewardPackageItem')}
        self.items = defaultdict(list)
        self.groups = defaultdict(list)
        for row in ctx.rows('RewardItem'):
            self.items[row['Name']].append(row)
        for row in ctx.rows('RewardPackage'):
            self.groups[row['Name']].append(row)

    def links(self, name, include_rates=False, context=None, preserve_checks=False):
        return self.resolve(self.items[name], self.groups[name], include_rates, context=context, preserve_checks=preserve_checks)

    def package_links(self, packages, faction='ERace::All', scale=100_000_000):
        return self.resolve([], [{'Race': faction, 'PackageItems': packages}], True, scale)

    def resolve(self, item_groups, package_groups, include_rates, package_scale=100_000_000, context=None, preserve_checks=False):
        links = {}

        def add(row, faction, package=None, pool_id=None):
            if row.get('ItemProb', 0) <= 0:
                return
            for link in self.ctx.item_links([row]):
                target = links.setdefault(link['id'], link)
                if include_rates:
                    rate = {
                        'kind': 'pool' if package is not None else 'direct',
                        'percent': row['ItemProb'] / 1_000_000,
                        'quantityMin': row['ItemCountMin'],
                        'quantityMax': row['ItemCountMax'],
                    }
                    if faction not in ('ERace::All', 'ERace::None'):
                        rate['faction'] = faction.split('::')[-1]
                    if row.get('ItemEnchant'):
                        rate['enhancementLevel'] = row['ItemEnchant']
                    if context:
                        rate.update(context)
                    if package is not None:
                        rate['poolPercent'] = package['Prob'] * 100 / package_scale
                        rate['poolCount'] = package['Count']
                        rate['poolId'] = pool_id
                    rates = target.setdefault('rewardRates', [])
                    if preserve_checks or rate not in rates:
                        rates.append(rate)

        for group in item_groups:
            for row in group['Items']:
                add(row, group['Race'])
        for group_index, group in enumerate(package_groups):
            for package_index, package in enumerate(group['PackageItems']):
                if package.get('Prob', 0) <= 0 or package.get('Count', 0) <= 0:
                    continue
                key = package.get('Item', package.get('PackageName'))
                for row in self.packages.get(key, []):
                    add(row, group['Race'], package, f'{group_index}:{package_index}:{key}')
        return list(links.values())
