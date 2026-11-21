"""Recipes, selectable boxes, mastery and gathering output relationships."""
from collections import defaultdict
from context import human, value


def build(ctx):
    for table in ['CraftRecipe', 'ConversionRecipe']:
        for row in ctx.rows(table):
            entry = ctx.entries[table + ':' + str(value(row['ID']))]
            output = ctx.link('Item', row['Product'], row['ProductCount'])
            ctx.section(entry, 'Produces', links=[output] if output else [])
            ctx.section(entry, 'Ingredients', links=ctx.item_links(row['ComponentList']))
            for component in row['ComponentList']:
                item = ctx.link('Item', component['Item'])
                if item:
                    ctx.item_section(item['id'], 'Used in recipes', links=[ctx.link(table, row['ID'])])
            if output:
                ctx.item_section(output['id'], 'Crafted from' if table == 'CraftRecipe' else 'Substance conversion', links=[ctx.link(table, row['ID'])])
            if table == 'ConversionRecipe':
                ctx.section(entry, 'Success and alternatives', facts=[ctx.fact('Success chance (%)', row['SuccessProp'] / 100), ctx.fact('Critical success chance (%)', row['CriticalSuccessProp'] / 100)], links=ctx.item_links([{'Item': row['CriticalSuccessProduct'], 'Count': row['CriticalSuccessProductCount']}, {'Item': row['FailRewardProduct'], 'Count': row['FailRewardProductCount']}]))
            else:
                combo = ctx.link('CraftRecipe', row['ComboRecipe']) if row['ComboRecipe'] != 'None' else None
                ctx.section(entry, 'Combo recipe', facts=[ctx.fact('Combo chance (%)', row['ComboProbability'] / 100)], links=[combo] if combo else [])
    rate_groups = {r['Name']: r['Rates'] for r in ctx.rows('CraftRecipeRate')}
    for row in ctx.rows('CraftRecipe'):
        rates = rate_groups.get(row['CraftRateGroup'], [])
        ctx.section(ctx.entries['CraftRecipe:' + str(value(row['ID']))], 'Mastery success rates', rows=[{'name': str(r['Gap']), 'facts': [ctx.fact('Mastery difference', r['Gap']), ctx.fact('Success chance (%)', r['Rate'] / 1_000_000)]} for r in rates])
    packages = {r['PackageName']: r['Items'] for r in ctx.rows('RewardPackageItem')}
    for table in ['BoxReward', 'BoxClassReward']:
        for index, row in enumerate(ctx.rows(table)):
            entry = ctx.entries[table + ':' + str(index)]
            direct = ctx.item_links(row['Items'])
            selectable = ctx.item_links(row['SelectItems'])
            random = []
            for pack in row['PackageItems']:
                random += ctx.item_links([r for r in packages.get(pack.get('Item', pack.get('PackageName')), []) if r.get('ItemProb', 0) > 0])
            ctx.section(entry, 'Contents', links=direct)
            ctx.section(entry, 'Choose a reward', links=selectable)
            ctx.section(entry, 'Possible contents', links=random)
            box_item = ctx.link('Item', row['Group'])
            if box_item:
                ctx.item_section(box_item['id'], 'Box contents', links=[{'id': entry['id'], 'name': entry['name'], 'category': 'boxes'}])
    materials = defaultdict(list)
    for row in ctx.rows('GatherSourceMaterial'):
        materials[row['MaterialGroup']].append(row)
    for row in ctx.rows('GatherSource'):
        entry = ctx.entries['GatherSource:' + str(value(row['ID']))]
        results = []
        for material in materials[row['MaterialGroup']]:
            output = ctx.link('Item', material['MaterialName'], material['MaterialCount'])
            if output:
                entry['name'] = output['name']
                entry['icon'] = output.get('icon', '')
                results.append({'name': output['name'], 'links': [output], 'facts': [ctx.fact('Gathering gauge', material['GatherGauge'])]})
                ctx.item_section(output['id'], 'Gathering requirements', links=[ctx.link('GatherSource', row['ID'])])
            extras = ctx.item_links(material['AddMaterialList'])
            ctx.section(entry, 'Additional materials', links=extras)
            ctx.section(entry, 'Failure materials', links=ctx.item_links(material['FailMaterialList']))
        ctx.section(entry, 'Gathering results', rows=results)
    for table, level, exp in [('GatherMastery', 'Level', 'NeedExp'), ('CraftMastery', 'CraftMasteryLevel', 'CraftMasteryExpNeed')]:
        entry = ctx.entry(table, {'Name': human(table)}, 'gathering' if table == 'GatherMastery' else 'recipes', key='levels', group='Mastery')
        ctx.section(entry, 'Mastery progression', rows=[{'name': str(r[level]), 'facts': ctx.facts(r, {exp: 'Experience required', 'BonusSkillPoint': 'Skill points', 'BonusSpecializedPoint': 'Specialization points'})} for r in ctx.rows(table)])
