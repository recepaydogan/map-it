"""Translate reviewed mechanics; localized Wowhead tooltips still describe old effects."""
import importlib.util
import re
import hashlib

spec = importlib.util.spec_from_file_location('hotfix', __file__.replace('localize-', 'apply-'))
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
read, save, baseline = h.read, h.save, h.baseline
changes = read('data/site-research/hotfix-2026-11-11/spell-changes.json')
names_source = read('public/data/locales/wow-forever/source.json')

# All descriptions explicitly distinguish faster ticks from increased damage per tick.
templates = {
'de': [
 'Verursacht 6 Sek. lang alle 1 Sek. 25,2 Schattenschaden, plus 1,75 pro Stufe bis zu 60 auf Stufe 60. Während des Kanalisierens verursachen Eure Effekte {effects} ihren regelmäßigen Schaden 100% schneller.',
 'Erhöht den Schaden oder die entzogene Gesundheit von {drains} um {p}% für jeden Eurer aktiven Effekte {effects} auf dem Ziel, bis zu {cap}%.',
 'Aktiviert sich im Mittel {ppm}-mal pro Minute; die Chance pro Schlag hängt vom Tempo der Waffenhand ab.',
 "Reist nach Shen'dar, um bei ausreichender Fertigkeit einen Lagergegenstand für Kräuterkunde herstellen zu lernen.",
 'Rezept: Elixier der Heiligen Macht', 'Elixier der Heiligen Macht'],
'es': [
 'Inflige 25,2 p. de daño de las Sombras cada 1 s durante 6 s, más 1,75 por nivel hasta 60 al nivel 60. Mientras canalizas, tus efectos de {effects} infligen su daño periódico un 100% más rápido.',
 'Aumenta el daño infligido o la salud drenada por {drains} un {p}% por cada uno de tus efectos de {effects} activos en el objetivo, hasta un {cap}%.',
 'Se activa aproximadamente {ppm} veces por minuto; la probabilidad por golpe depende de la velocidad del arma de la mano derecha.',
 "Ve a la aldea Shen'dar para aprender a fabricar un objeto de acampada de Herboristería cuando tengas suficiente habilidad.",
 'Receta: elixir de poder sagrado', 'Elixir de poder sagrado'],
'fr': [
 'Inflige 25,2 points de dégâts d’ombre toutes les 1 s pendant 6 s, plus 1,75 par niveau jusqu’à 60 au niveau 60. Pendant la canalisation, vos effets {effects} infligent leurs dégâts périodiques 100% plus vite.',
 'Augmente les dégâts infligés ou les points de vie drainés par {drains} de {p}% pour chacun de vos effets {effects} actifs sur la cible, jusqu’à {cap}%.',
 'Se déclenche environ {ppm} fois par minute ; la probabilité par coup dépend de la vitesse de l’arme en main droite.',
 "Rendez-vous au village de Shen'dar pour apprendre à fabriquer un objet de campement d’Herboristerie lorsque votre compétence est suffisante.",
 'Recette : Élixir de puissance sacrée', 'Élixir de puissance sacrée'],
'ko': [
 '6초 동안 1초마다 25.2의 암흑 피해를 입힙니다. 레벨마다 1.75씩 증가하여 60레벨에 60이 됩니다. 정신을 집중하는 동안 대상에게 걸린 자신의 {effects} 효과가 주기적인 피해를 100% 더 빠르게 입힙니다.',
 '대상에게 걸린 자신의 {effects} 효과 하나마다 {drains}의 피해 또는 흡수하는 생명력이 {p}%만큼, 최대 {cap}%까지 증가합니다.',
 '분당 약 {ppm}회 발동합니다. 공격당 발동 확률은 주 장비 무기의 속도에 따라 달라집니다.',
 "약초채집 숙련도가 충분해지면 셴다르 마을로 가서 약초채집용 야영 물품 제작법을 배우십시오.",
 '조제법: 신성한 힘의 비약', '신성한 힘의 비약'],
'pt-BR': [
 'Causa 25,2 de dano de Sombra a cada 1 s por 6 s, mais 1,75 por nível, até 60 no nível 60. Durante a canalização, seus efeitos de {effects} causam dano periódico 100% mais rápido.',
 'Aumenta o dano causado ou a vida drenada por {drains} em {p}% por cada um dos seus efeitos de {effects} ativos no alvo, até {cap}%.',
 'Ativa aproximadamente {ppm} vezes por minuto; a chance por golpe depende da velocidade da arma da mão principal.',
 "Vá à aldeia Shen'dar para aprender a criar um item de acampamento de Herborismo quando tiver habilidade suficiente.",
 'Receita: Elixir de Poder Sagrado', 'Elixir de Poder Sagrado'],
'zh-Hans': [
 '持续6秒，每1秒造成25.2点暗影伤害，每级增加1.75点，60级时达到60点。引导期间，你在目标身上的{effects}效果造成周期性伤害的频率提高100%。',
 '目标身上每有一个你施加的{effects}效果，{drains}造成的伤害或吸取的生命值提高{p}%，最多提高{cap}%。',
 '平均每分钟触发{ppm}次；每次攻击的触发几率取决于主手武器速度。',
 '草药学技能达到要求后，前往Shen’dar村学习制作草药学露营物品。',
 '配方：神圣能量药剂', '神圣能量药剂'],
'zh-Hant': [
 '持續6秒，每1秒造成25.2點暗影傷害，每級增加1.75點，60級時達到60點。引導期間，你在目標身上的{effects}效果造成週期性傷害的頻率提高100%。',
 '目標身上每有一個你施加的{effects}效果，{drains}造成的傷害或吸取的生命力提高{p}%，最多提高{cap}%。',
 '平均每分鐘觸發{ppm}次；每次攻擊的觸發機率取決於主手武器速度。',
 '草藥學技能達到要求後，前往Shen’dar村學習製作草藥學露營物品。',
 '配方：神聖能量藥劑', '神聖能量藥劑'],
}
templates['es-MX'] = templates['es']
wrack_clauses = {
'de': [r'verstärkt seine anderen Schatteneffekte mit Schaden über Zeit um 10\s*%', r'Dieser Schaden-über-Zeit-Zauber verstärkt deine übrigen Schatteneffekte mit Schaden über Zeit um 10\s*%', 'lässt {effects} während des Kanalisierens 100% schneller regelmäßigen Schaden verursachen'],
'es': [r'aumenta un 10\s*% el daño de sus otros efectos de Sombras periódicos', r'Este efecto de daño en el tiempo potencia un 10\s*% tus otros efectos periódicos de las Sombras', 'hace que {effects} inflijan daño periódico un 100% más rápido mientras canalizas'],
'fr': [r'augmente de 10\s*% les dégâts de ses autres effets d’ombre sur la durée', r'Cet effet de dégâts sur la durée (?:augmente|renforce) de 10\s*% vos autres (?:effets|dégâts)[^.]*?(?= et )', 'fait infliger à {effects} leurs dégâts périodiques 100% plus vite pendant la canalisation'],
'ko': [r'다른 암흑 지속 피해를 10% 강화합니다', r'다른 암흑 지속 피해를 10% (?:높이며|강화하며|높이고|증가시키며)', '정신 집중 중 {effects}의 주기적인 피해 발생 빈도가 100% 증가합니다'],
'pt-BR': [r'aumenta em 10% o dano dos outros efeitos periódicos de Sombra', r'Esse efeito de dano periódico aumenta em 10% seus outros danos periódicos de Sombra', 'faz {effects} causarem dano periódico 100% mais rápido durante a canalização'],
'zh-Hans': [r'使其他暗影持续伤害提高\s*10%', r'新持续伤害天赋', '使{effects}在引导期间造成周期性伤害的频率提高100%'],
'zh-Hant': [r'使其他暗影持續傷害提高\s*10%', r'新持續傷害天賦', '使{effects}在引導期間造成週期性傷害的頻率提高100%'],
}
wrack_clauses['es-MX'] = wrack_clauses['es']

source_path = 'public/data/spells/writeups/locales/source.json'
writeup_source = read(source_path)
quest_source_path = 'public/data/locales/wow-forever/quest-text-source.json'
quest_source = read(quest_source_path)
quest_key = '97968:objective'
quest_english = read('public/data/quests/quest-details.json')['quests']['97968']['objective']
if quest_key not in quest_source['keys']:
    quest_source['keys'].append(quest_key)
    quest_source['values'].append(quest_english)
else:
    quest_source['values'][quest_source['keys'].index(quest_key)] = quest_english

for lang, locale in h.LANGUAGES.items():
    template = templates[lang]
    name_path = f'public/data/locales/wow-forever/{locale}.json'
    name_pack = read(name_path)
    def name(sid):
        key = f'SpellName:{sid}:0'
        return name_pack['values'][names_source['keys'].index(key)]
    effects = ', '.join(name(sid) for sid in [172, 18265, 980])
    drains = ', '.join(name(sid) for sid in [689, 1120, 1316697])
    wrack = template[0].format(effects=effects)
    talent_path = f'public/data/classes/locales/talents-{lang}.json'
    talents = baseline(talent_path)
    tooltip_path = f'public/data/locales/wow-forever/spell-tooltip-{locale}.json'
    tooltips = baseline(tooltip_path)
    translations = {}
    for tid, sid in [('104743','17364'), ('104755','415140'), ('104741','408498'), ('105911','17804'), ('105909','1316697')]:
        for index, english in enumerate(changes['ranks'][sid]):
            slot = talents['entries'][tid]['ranks'][str(index)]
            text = slot['text']
            if sid == '17364': text = text.replace('150', '100')
            if sid == '415140': text = re.sub(r'(?<!\d)(50|100|150)(?=\s*%)', str([33,66,100][index]), text)
            if sid == '408498':
                text = re.sub(r'(?<!\d)(4|8|12|16|20)(?=\s*%)', '20', text)
                text += ' ' + template[2].format(ppm=index+6)
            if sid == '17804': text = template[1].format(effects=effects, drains=drains, p=(index+1)*4, cap=(index+1)*12)
            if sid == '1316697': text = wrack
            slot['sources'] = list(dict.fromkeys([*slot.get('sources', []), english]))
            slot['text'] = text
            translations[english] = text
            if index == 0: tooltips['entries'].setdefault(sid, {})['d'] = text
    # Aura text has the same effect and duration, without an obsolete damage modifier.
    tooltips['entries']['1316697']['a'] = wrack
    save(talent_path, talents)
    save(tooltip_path, tooltips)
    class_path = f'public/data/classes/locales/{lang}.json'
    class_pack = read(class_path)
    class_pack['translations'].update(translations)

    def translate_updated(old, new, text):
        if new in translations: return translations[new]
        # Numeric changes are limited to paragraphs containing the reviewed talent.
        if '150% normalized weapon damage' in old or '150% of your Intellect' in old:
            text = re.sub(r'150(?=\s*%)', '100', text)
        if 'other Affliction effects' in old or 'per active Affliction effect' in old:
            patterns = {'de':r'(?:jeden aktiven|jeden weiteren|jeden deiner anderen|jeden Eurer anderen) Gebrechen[- ]Effekt',
              'es':r'cada (?:otro efecto de Aflicción (?:tuyo|que tengas)|uno de tus otros efectos de Aflicción|efecto de Aflicción activo)',
              'es-MX':r'cada (?:otro efecto de Aflicción (?:tuyo|que tengas)|uno de tus otros efectos de Aflicción|efecto de Aflicción activo)',
              'fr':r'(?:chaque (?:autre effet d[’\x27]Affliction|effet d’Affliction actif)|chacun de (?:vos|tes) autres effets d[’\x27]Affliction)',
              'ko':r'(?:다른 )?고통 효과(?: 하나)?마다',
              'pt-BR':r'cada (?:outro efeito de Suplício(?: seu)?|efeito de Suplício ativo)',
              'zh-Hans':r'(?:每多一个痛苦系效果|每有一项其他痛苦效果|每有一种你施加的其他痛苦系效果)',
              'zh-Hant':r'(?:每多一個痛苦系效果|每有一項其他痛苦效果|每有一種你施加的其他痛苦系效果)'}
            phrases = {'de':f'jeden aktiven Effekt von {effects}', 'es':f'cada efecto activo de {effects}', 'es-MX':f'cada efecto activo de {effects}',
                       'fr':f'chaque effet actif de {effects}', 'ko':f'{effects} 효과 하나마다', 'pt-BR':f'cada efeito ativo de {effects}',
                       'zh-Hans':f'每有一个{effects}效果', 'zh-Hant':f'每有一個{effects}效果'}
            text = re.sub(patterns[lang], lambda _: phrases[lang], text)
            text = text.replace('你的其他痛苦效果', f'你的{effects}效果').replace('你的其他痛苦效果', f'你的{effects}效果')
        if 'Wrack makes it hit harder while Wrack is on the target' in old:
            clauses = {
              'de': ('Zermürben erhöht seinen Schaden, solange Zermürben auf dem Ziel liegt', 'Zermürben lässt es während des Kanalisierens 100% schneller Schaden verursachen'),
              'es': ('Arruinar aumenta su daño mientras Arruinar esté en el objetivo', 'Arruinar hace que inflija daño periódico un 100% más rápido mientras canalizas'),
              'fr': ('Calvaire augmente ses dégâts tant que Calvaire est sur la cible', 'Calvaire lui fait infliger ses dégâts périodiques 100% plus vite pendant la canalisation'),
              'ko': ('괴멸은 대상에게 괴멸이 걸린 동안 피해를 높입니다', '괴멸에 정신을 집중하는 동안 주기적인 피해 발생 빈도가 100% 증가합니다'),
              'pt-BR': ('Destruição aumenta seu dano enquanto Destruição estiver no alvo', 'Destruição faz com que cause dano periódico 100% mais rápido durante a canalização'),
              'zh-Hans': ('目标受到折磨影响时，折磨还会提高它的伤害', '引导折磨时，它造成周期性伤害的频率提高100%'),
              'zh-Hant': ('目標受到毀壞影響時，毀壞還會提高它的傷害', '引導毀壞時，它造成週期性傷害的頻率提高100%')}
            a,b=clauses['es' if lang=='es-MX' else lang]
            text=text.replace(a,b)
        if 'makes your other shadow DoTs 10% stronger' in old:
            first, second, clause = wrack_clauses[lang]
            text = re.sub(first, lambda _: clause.format(effects=effects), text)
            if lang.startswith('zh-'):
                text = text.replace('新持续伤害天赋', '新引导天赋').replace('新持續傷害天賦', '新引導天賦')
            else:
                text = re.sub(second, lambda _: name(1316697) + ' ' + clause.format(effects=effects), text)
        return text

    # Update translated class-guide overrides by their existing path and source.
    for cls in ['shaman', 'warlock']:
        p = f'public/data/classes/guides/locales/{lang}/{cls}.json'
        pack = baseline(p)
        for edit in pack['edits']:
            old = edit['source']
            new = h.walk(old, changes['replacements'])
            for a,b in list(changes['replacements'].items())[-5:]: new = h.walk(new, {a:b})
            if new != old:
                edit['sources'] = list(dict.fromkeys([*edit.get('sources', []), new]))
                edit['text'] = translate_updated(old, new, edit['text'])
        save(p, pack)
    wp = f'public/data/spells/writeups/locales/{lang}.json'
    pack = read(wp)
    original_source = baseline(source_path)['strings']
    for index, old in enumerate(original_source):
        new = h.walk(old, changes['replacements'])
        for a,b in list(changes['replacements'].items())[-5:]: new = h.walk(new,{a:b})
        if new != old and index < len(pack['values']):
            translations[new] = translate_updated(old, new, pack['values'][index])
    for english, text in translations.items():
        if english not in writeup_source['strings']: writeup_source['strings'].append(english)
        index = writeup_source['strings'].index(english)
        while len(pack['values']) <= index: pack['values'].append('')
        pack['values'][index] = text
    save(wp, pack)
    class_pack['translations'].update(translations)
    save(class_path, class_pack)
    qp = f'public/data/locales/wow-forever/quest-text-{locale}.json'
    pack = read(qp)
    index = quest_source['keys'].index(quest_key)
    while len(pack['values']) <= index: pack['values'].append('')
    pack['values'][index] = template[3]
    save(qp, pack)
    qp = f'public/data/locales/wow-forever/quest-prose-wowhead-{locale}.json'
    pack = read(qp)
    if '97968' in pack['quests']:
        entry = pack['quests']['97968']
        entry.setdefault('english', {})['objective'] = quest_english
        entry.setdefault('locales', {}).setdefault(locale, {})['objective'] = template[3]
        save(qp, pack)
    for key, text in [('ItemSparse:21547:0', template[4]), ('SpellName:1310077:0', template[5])]:
        if key in names_source['keys']: name_pack['values'][names_source['keys'].index(key)] = text
    save(name_path, name_pack)
save(source_path, writeup_source)
quest_source['provenance']['catalogSha256'] = hashlib.sha256((h.ROOT/'public/data/quests/quest-details.json').read_bytes()).hexdigest()
save(quest_source_path, quest_source)
h.receipt()
