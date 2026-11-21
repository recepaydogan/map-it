"""Resolve achievement titles and objectives through AchievementString rows."""
from context import human


def strings_by_name(ctx):
    return {row['Name']: row for row in ctx.rows('AchievementString')}


def step_text(ctx, step, strings):
    text = strings.get(step.get('AchievementText'), {})
    title = ctx.text(text.get('AchievementTitle')) or ctx.text(step.get('AchievementText'))
    objective = ctx.text(text.get('ObjDesc'))
    return title, objective


def localized_title(ctx, row, step, strings):
    title, _ = step_text(ctx, step, strings)
    return ctx.text(row['CollectionTitle']) or title


def entry_name(ctx, row, step, group, strings):
    return localized_title(ctx, row, step, strings) or ctx.text(group.get('Title')) or human(row['ObjType'])
