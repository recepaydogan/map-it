"""Import explicit object -> teleport routes; never infer routes from proximity."""
from context import value

PORTAL_USAGES = {'MoveMap', 'MovemapCondition'}


def build(ctx):
    teleports = {row['Name']: row for row in ctx.rows('Teleport')}
    maps = {value(row['ID']): row for row in ctx.rows('Map')}
    for row in ctx.rows('EnvObjData'):
        usage = row['Usage'].split('::')[-1]
        if usage not in PORTAL_USAGES:
            continue
        teleport = teleports.get(row['UsageValue'])
        if not teleport:
            raise ValueError(f'Unresolved portal target: {row["Name"]} -> {row["UsageValue"]}')
        map_id = value(teleport['MapId'])
        entry = ctx.entry('EnvObjData', row, 'travel', group='Portal',
                          fields={'Level': 'Required level', 'CombatPower': 'Required combat power'},
                          description=ctx.text(row['UsageValue4']))
        entry['destination'] = {'mapId': map_id, 'actor': teleport['ActorName']}
        entry['route'] = {
            'kind': 'portal', 'usage': usage,
            'sourceObjectId': value(row['ID']), 'sourceObject': row['Name'],
            'teleportId': value(teleport['ID']), 'teleportName': teleport['Name'],
            'destinationName': ctx.text(row['UsageValue3']) or ctx.text(maps[map_id]['Desc']),
        }
        entry['portalRequirements'] = {key: row[key] for key in (
            'RequireType', 'RequireValues', 'RequireCount', 'bIsOptionalRequirement', 'InteractConditionList')}
        entry['facts'].append(ctx.fact('Faction', maps[map_id]['MapRace'].split('::')[-1]))
