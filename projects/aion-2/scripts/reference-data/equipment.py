"""Item metadata and shared upgrade, set and decomposition records."""
from collections import defaultdict
import importlib
from context import human, value

effect_summary = importlib.import_module('effect-summary')

def use_effect_links(ctx, row):
    """Resolve only reference parameters defined by the item's effect type."""
    targets = {
        'EItemUseEffect::Skill': ('Skill', slice(0, 1)),
        'EItemUseEffect::GetWing': ('Wing', slice(0, 1)),
        'EItemUseEffect::GetVehicle': ('VehicleList', slice(0, 1)),
        'EItemUseEffect::GetVehicleSoul': ('VehicleList', slice(0, 1)),
        'EItemUseEffect::GetTitle': ('Title', slice(0, 1)),
        'EItemUseEffect::AddContentsTicket': ('ContentsTicket', slice(0, 1)),
        'EItemUseEffect::AddMultiContentsTicket': ('ContentsTicket', slice(1, 3)),
    }
    target = targets.get(row.get('UseEffect'))
    if target is None:
        return []
    table, positions = target
    # Counts, levels and imprint groups are not generic reference IDs.
    return [link for key in row.get('UseEffectValues', [])[positions]
            if (link := ctx.link(table, key))]


def build(ctx):
    upgrades = {}
    for table in ['Enchant', 'ExceedEnchant', 'ItemSurpass', 'ItemSoulAdd', 'ItemSuccession']:
        groups = defaultdict(list)
        for row in ctx.rows(table):
            groups[row['Group']].append(row)
        for group, rows in groups.items():
            entry = ctx.entry(table, {'Name': group}, 'enhancements', key=group, group=human(table))
            steps = []
            for row in rows:
                facts = ctx.facts(row, {'CostGold': 'Currency cost', 'CostCurrencyType': 'Currency', 'FailPenalty': 'Failure penalty', 'SuccessionCount': 'Transfers'})
                for key, label in [('SuccessProb', 'Success chance (%)'), ('FailCorrectionProb', 'Failure correction (%)')]:
                    if key in row:
                        facts.append(ctx.fact(label, row[key] / 100))
                costs = ctx.item_links(row.get('CostItems', []))
                for key in ['CostItem']:
                    if row.get(key) and row[key] != 'None':
                        costs += ctx.item_links(row[key] if isinstance(row[key], list) else [{'Item': row[key], 'Count': row.get('CostItemCount', 1)}])
                steps.append({'name': '+' + str(row.get('CurrentLevel', row.get('SuccessionCount', 0))), 'facts': facts, 'links': costs})
            ctx.section(entry, 'Upgrade steps', rows=steps)
            upgrades[(table, group)] = entry
    for row in ctx.rows('SoulBindCost'):
        entry = ctx.entry('SoulBindCost', row, 'enhancements', group='Soul binding', fields={'RerollCostCount': 'Reroll currency cost', 'RerollCostCurrency': 'Currency'})
        ctx.section(entry, 'Reroll materials', links=ctx.item_links([{'Item': row['RerollCostItem'], 'Count': row['RerollCostItemCount']}]))
        ctx.section(entry, 'Binding costs', rows=[{'name': str(i + 1), 'facts': ctx.facts(cost, {'CostA_Amount': 'Currency cost', 'CostB_Amount': 'Material count'}), 'links': ctx.item_links([{'Item': cost['CostB_Id'], 'Count': cost['CostB_Amount']}])} for i, cost in enumerate(row['CostDatas'])])
    imprint = defaultdict(list)
    for row in ctx.rows('ImprintMagicStoneProb'):
        imprint[row['ImprintGroupName']].append(row)
    for group, rows in imprint.items():
        entry = ctx.entry('ImprintMagicStoneProb', {'Name': group}, 'enhancements', key=group, group='Stone imprinting')
        ctx.section(entry, 'Possible results', rows=[{'name': human(r['AddStatType']), 'facts': [ctx.fact('Selection weight', r['AddStatProb'])], 'links': [], 'description': '\n'.join(human(s['StatGrade']) + ': ' + str(s['StatValue']) + ' (' + str(s['StatProb'] / 100) + '%)' for s in r['StatInfos'] if s['StatProb'] > 0)} for r in rows])
    effects = defaultdict(list)
    for row in ctx.rows('ItemSetEffect'):
        effects[row['SetName']].append(row)
    for row in ctx.rows('ItemSet'):
        entry = ctx.entries['ItemSet:' + row['SetName']]
        ctx.section(entry, 'Set pieces', links=ctx.item_links([{'Item': name} for name in row['SetItems']]))
        ctx.section(entry, 'Set bonuses', rows=[{'name': str(r['SetEquipCount']), 'facts': ctx.stats(r['OptStats']), 'links': [link] if (link := ctx.link('SkillAbnormal', r['OptAbnormalId'])) else []} for r in effects[row['SetName']]])
    for row in ctx.rows('Item'):
        item_id = str(value(row['ID']))
        item = ctx.items[item_id]
        description = ctx.text(row.get('DescLong'))
        if description:
            item['description'] = description
        item['binding'] = ctx.text(row['ExchangeType'], human(row['ExchangeType']))
        item['canDismantle'] = bool(row.get('CanDecompose'))
        links = []
        for field, table in [('EnchantGroup', 'Enchant'), ('ExceedEnchantGroup', 'ExceedEnchant'), ('SurpassGroup', 'ItemSurpass'), ('SoulAddGroup', 'ItemSoulAdd'), ('SuccessionGroup', 'ItemSuccession'), ('SoulbindCostName', 'SoulBindCost')]:
            key = row.get(field)
            if key and key != 'None':
                link = ctx.link(table, key)
                if link:
                    links.append(link)
        for name in row.get('SetNames', []):
            link = ctx.link('ItemSet', name)
            if link:
                links.append(link)
        ctx.item_section(item_id, 'Upgrades and sets', links=links)
        if row.get('UseEffect') and not row['UseEffect'].endswith('::None'):
            effect = human(row['UseEffect'])
            ctx.item_section(item_id, 'Use effect', facts=[ctx.fact('Effect', effect)],
                             links=use_effect_links(ctx, row), **effect_summary.describe(description))
    effect_summary.attach_skill_descriptions(ctx)


def decomposition(ctx):
    packages = {r['PackageName']: r['Items'] for r in ctx.rows('RewardPackageItem')}
    groups = defaultdict(list)
    for row in ctx.rows('RewardDecomposePackage'):
        groups[row['Name']].append(row)
    used_groups = {g for r in ctx.rows('Item') if r.get('CanDecompose') for g in r['DecomposeResultItemGroup']}
    for name in sorted(used_groups):
        if name not in groups:
            continue
        entry = ctx.entry('RewardDecomposePackage', {'Name': name}, 'enhancements', key=name, group='Dismantling')
        levels = []
        for row in groups[name]:
            links = []
            for pack in row['Packages']:
                if pack['Prob'] <= 0:
                    continue
                links += ctx.item_links([i for i in packages.get(pack['Item'], []) if i.get('ItemProb', 0) > 0])
            unique = {i['id']: i for i in links}
            levels.append({'name': '+' + str(row['EnchantLevel']), 'links': list(unique.values())})
        ctx.section(entry, 'Possible dismantling results', rows=levels)
    for row in ctx.rows('Item'):
        links = [link for key in row.get('DecomposeResultItemGroup', []) if key in used_groups and (link := ctx.link('RewardDecomposePackage', key))]
        if links:
            ctx.item_section(str(value(row['ID'])), 'Dismantling', facts=[ctx.fact('Currency cost', row['DecomposeCostGold'])], links=links)
