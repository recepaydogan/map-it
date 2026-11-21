"""Publish only the verified Dawn Waker route; no guessed ending or reward."""
import importlib.util
import html
import re
import json
spec=importlib.util.spec_from_file_location('hotfix', __file__.replace('add-dawn-waker-guide.py','apply-november-11-hotfixes.py'))
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

# Localized instructions, with proper names kept consistent with the source entities.
texts={
'en': ['Dawn Waker: the known route', 'Verified steps as of November 10. The ending and final reward remain unknown.',
 'Ring and blade', 'The water globe', 'The spirit and the tome', 'Three cleansing items', 'The current endpoint',
 'Get Ancient Heirloom from Coming of Age (Skyborne) or the upstairs ring pickup, available to any race.',
 "Use Night Watchman’s Torch to reveal Ancient Hilt. Take it to Ealaane Nimbuswalker. Find Ancient Skyborne Blade at one of the reported spots, then return to her for Eluvi’ana. Blade spawns vary.",
 'Alliance: combine 20 Mathystral Amulet Fragments, summon Baron Marinous, then visit Onu. Horde: obtain Strange Water Globe from Baron Aquanis in Blackfathom Deeps, then visit Je’neu. After turning it in, ask for the globe back.',
 'Equip Ancient Heirloom and carry the globe to Highborne Spirit. Kill Narassin for Azsharan Key; open the box behind him for his tome. Return to the spirit, then speak to Mordent Evenshade in Shen’dralas (35.05, 46.49).',
 'Star of Elune: wear the ring and bring five players to the Feralas vault. Four players activate the switches together; one enters the vault. The first switch is upstairs.',
 'Abyssal Chest: underwater in Azshara; complete the Kirith–Azsharite quest chain first. Tears of Anguish: after speaking to Mordent, defeat Anguished or Suffering Highborne near Lake Kel’theril. The ring is not required for these drops.',
 'Return to Mordent. At Shrine of Coalescence, use the globe with all three cleansing items. Return with Cleansed Water Globe, then speak to Prince Tortheldrin in Dire Maul. Further steps and an Honored reputation requirement are not confirmed.',
 'Ring pickup — upstairs', 'Torch required', 'Possible blade spawn', 'Ring and water globe required', 'Key and tome', 'Five-player vault', 'Simultaneous switch', 'Underwater chest', 'Tears of Anguish farming area', 'Cleanse the water globe'],
'de': ['Dawn Waker: der bekannte Weg', 'Bestätigte Schritte mit Stand vom 10. November. Ende und endgültige Belohnung sind noch unbekannt.',
 'Ring und Klinge', 'Die Wasserkugel', 'Geist und Foliant', 'Drei Reinigungsgegenstände', 'Der bisherige Endpunkt',
 'Holt Ancient Heirloom über Coming of Age (Skyborne) oder den Ring im Obergeschoss, der allen Völkern zugänglich ist.',
 'Enthüllt Ancient Hilt mit Night Watchman’s Torch und bringt ihn zu Ealaane Nimbuswalker. Sucht Ancient Skyborne Blade an einem der gemeldeten Orte und kehrt für Eluvi’ana zurück. Die Klinge erscheint an wechselnden Orten.',
 'Allianz: Kombiniert 20 Mathystral Amulet Fragments, beschwört Baron Marinous und besucht Onu. Horde: Holt Strange Water Globe von Baron Aquanis in der Tiefschwarzen Grotte und besucht Je’neu. Bittet nach der Abgabe erneut um die Kugel.',
 'Legt Ancient Heirloom an und bringt die Kugel zum Highborne Spirit. Tötet Narassin für Azsharan Key und öffnet damit die Kiste hinter ihm für seinen Folianten. Kehrt zum Geist zurück und sprecht dann mit Mordent Evenshade in Shen’dralas (35.05, 46.49).',
 'Star of Elune: Tragt den Ring und bringt fünf Spieler zum Gewölbe in Feralas. Vier betätigen gleichzeitig die Schalter, während einer das Gewölbe betritt. Der erste Schalter ist oben.',
 'Abyssal Chest: unter Wasser in Azshara; schließt zuerst die Questreihe Kirith–Azsharite ab. Tears of Anguish: Besiegt nach dem Gespräch mit Mordent Anguished oder Suffering Highborne am Kel’therilsee. Für diese Beute ist der Ring nicht nötig.',
 'Kehrt zu Mordent zurück. Verwendet am Shrine of Coalescence die Kugel mit allen drei Reinigungsgegenständen. Bringt Cleansed Water Globe zurück und sprecht mit Prinz Tortheldrin in Düsterbruch. Weitere Schritte und eine erforderliche wohlwollende Rufstufe sind nicht bestätigt.',
 'Ring im Obergeschoss', 'Fackel erforderlich', 'Möglicher Klingenfundort', 'Ring und Wasserkugel erforderlich', 'Schlüssel und Foliant', 'Gewölbe für fünf Spieler', 'Gleichzeitig betätigen', 'Truhe unter Wasser', 'Fundgebiet für Tears of Anguish', 'Wasserkugel reinigen'],
'es': ['Dawn Waker: la ruta conocida', 'Pasos confirmados hasta el 10 de noviembre. El final y la recompensa definitiva siguen sin conocerse.',
 'Anillo y espada', 'El globo de agua', 'El espíritu y el tomo', 'Tres objetos de purificación', 'El último paso conocido',
 'Consigue Ancient Heirloom mediante Coming of Age (Skyborne) o recoge el anillo del piso superior, disponible para cualquier raza.',
 'Usa Night Watchman’s Torch para revelar Ancient Hilt y llévaselo a Ealaane Nimbuswalker. Busca Ancient Skyborne Blade en uno de los lugares registrados y vuelve para recibir Eluvi’ana. La espada aparece en lugares variables.',
 'Alianza: combina 20 Mathystral Amulet Fragments, invoca a Baron Marinous y visita a Onu. Horda: consigue Strange Water Globe de Baron Aquanis en Cavernas de Brazanegra y visita a Je’neu. Tras entregarlo, pide que te devuelvan el globo.',
 'Equipa Ancient Heirloom y lleva el globo al Highborne Spirit. Mata a Narassin para conseguir Azsharan Key y abre la caja a su espalda para obtener su tomo. Vuelve al espíritu y habla con Mordent Evenshade en Shen’dralas (35.05, 46.49).',
 'Star of Elune: lleva el anillo y reúne cinco jugadores en la cámara de Feralas. Cuatro activan los interruptores a la vez y uno entra en la cámara. El primer interruptor está arriba.',
 'Abyssal Chest: bajo el agua en Azshara; completa antes la cadena Kirith–Azsharite. Tears of Anguish: después de hablar con Mordent, derrota a Anguished o Suffering Highborne junto al lago Kel’theril. Estos objetos no requieren llevar el anillo.',
 'Vuelve a Mordent. En Shrine of Coalescence, usa el globo con los tres objetos de purificación. Regresa con Cleansed Water Globe y habla con el príncipe Tortheldrin en La Masacre. No están confirmados los pasos posteriores ni un requisito de reputación Honorable.',
 'Anillo en el piso superior', 'Requiere antorcha', 'Posible aparición de la espada', 'Requiere anillo y globo', 'Llave y tomo', 'Cámara para cinco jugadores', 'Activación simultánea', 'Cofre submarino', 'Zona de Tears of Anguish', 'Purifica el globo'],
'fr': ['Dawn Waker : le parcours connu', 'Étapes confirmées au 10 novembre. La fin et la récompense finale restent inconnues.',
 'Anneau et lame', 'Le globe d’eau', 'L’esprit et le grimoire', 'Trois objets de purification', 'La dernière étape connue',
 'Obtenez Ancient Heirloom avec Coming of Age (Skyborne) ou ramassez l’anneau à l’étage, accessible à toutes les races.',
 'Utilisez Night Watchman’s Torch pour révéler Ancient Hilt et apportez-le à Ealaane Nimbuswalker. Cherchez Ancient Skyborne Blade à l’un des endroits signalés, puis revenez chercher Eluvi’ana. La lame apparaît à des endroits variables.',
 'Alliance : combinez 20 Mathystral Amulet Fragments, invoquez Baron Marinous et rendez visite à Onu. Horde : obtenez Strange Water Globe sur Baron Aquanis dans les Profondeurs de Brassenoire, puis voyez Je’neu. Après l’avoir rendu, redemandez le globe.',
 'Équipez Ancient Heirloom et apportez le globe au Highborne Spirit. Tuez Narassin pour obtenir Azsharan Key et ouvrez le coffre derrière lui pour récupérer son grimoire. Retournez voir l’esprit, puis Mordent Evenshade à Shen’dralas (35.05, 46.49).',
 'Star of Elune : portez l’anneau et réunissez cinq joueurs au caveau de Féralas. Quatre actionnent les interrupteurs simultanément pendant qu’un joueur entre. Le premier interrupteur est à l’étage.',
 'Abyssal Chest : sous l’eau en Azshara ; terminez d’abord la suite Kirith–Azsharite. Tears of Anguish : après avoir parlé à Mordent, tuez les Anguished ou Suffering Highborne près du lac Kel’theril. Ces objets ne nécessitent pas l’anneau.',
 'Retournez auprès de Mordent. Au Shrine of Coalescence, utilisez le globe avec les trois objets de purification. Rapportez Cleansed Water Globe, puis parlez au prince Tortheldrin à Hache-Tripes. Les étapes suivantes et une réputation Honoré requise ne sont pas confirmées.',
 'Anneau à l’étage', 'Torche requise', 'Apparition possible de la lame', 'Anneau et globe requis', 'Clé et grimoire', 'Caveau pour cinq joueurs', 'Activation simultanée', 'Coffre sous-marin', 'Zone des Tears of Anguish', 'Purifier le globe'],
'ko': ['Dawn Waker: 확인된 경로', '11월 10일 기준으로 확인된 단계입니다. 결말과 최종 보상은 아직 밝혀지지 않았습니다.',
 '반지와 검', '물의 구슬', '영혼과 고서', '정화 재료 세 가지', '현재 확인된 마지막 단계',
 'Coming of Age(Skyborne)를 완료하거나 건물 위층에서 모든 종족이 획득할 수 있는 Ancient Heirloom 반지를 챙기세요.',
 'Night Watchman’s Torch로 Ancient Hilt를 드러내 Ealaane Nimbuswalker에게 가져가세요. 보고된 장소 중 한 곳에서 Ancient Skyborne Blade를 찾고 돌아가 Eluvi’ana를 받으세요. 검의 생성 위치는 바뀔 수 있습니다.',
 '얼라이언스: Mathystral Amulet Fragments 20개를 합쳐 Baron Marinous를 소환한 뒤 Onu를 찾아가세요. 호드: 검은심연 나락의 Baron Aquanis에게서 Strange Water Globe를 얻어 Je’neu에게 가져가세요. 반납 후 다시 대화해 구슬을 돌려받으세요.',
 'Ancient Heirloom을 착용하고 구슬을 지닌 채 Highborne Spirit과 대화하세요. Narassin을 처치해 Azsharan Key를 얻고 뒤쪽 상자에서 고서를 꺼내세요. 영혼에게 돌아간 다음 Shen’dralas의 Mordent Evenshade(35.05, 46.49)와 대화하세요.',
 'Star of Elune: 반지를 착용하고 다섯 명이 페랄라스 금고로 가세요. 네 명이 스위치를 동시에 작동시키고 한 명이 금고에 들어갑니다. 첫 번째 스위치는 위층에 있습니다.',
 'Abyssal Chest: 아즈샤라 수중에 있으며 먼저 Kirith–Azsharite 연계 퀘스트를 완료해야 합니다. Tears of Anguish: Mordent와 대화한 뒤 켈테릴 호수 주변의 Anguished 또는 Suffering Highborne을 처치하세요. 이 전리품에는 반지가 필요하지 않습니다.',
 'Mordent에게 돌아가세요. Shrine of Coalescence에서 세 가지 정화 재료와 구슬을 사용하세요. Cleansed Water Globe를 가져다준 뒤 혈투의 전장의 왕자 토르텔드린과 대화하세요. 이후 단계와 우호적 평판 요구 조건은 확인되지 않았습니다.',
 '위층의 반지', '횃불 필요', '검 생성 가능 지점', '반지와 구슬 필요', '열쇠와 고서', '5인 금고', '동시에 작동', '수중 상자', 'Tears of Anguish 획득 지역', '구슬 정화'],
'pt-BR': ['Dawn Waker: a rota conhecida', 'Etapas confirmadas até 10 de novembro. O desfecho e a recompensa final ainda são desconhecidos.',
 'Anel e lâmina', 'O globo de água', 'O espírito e o tomo', 'Três itens de purificação', 'A última etapa conhecida',
 'Obtenha Ancient Heirloom por Coming of Age (Skyborne) ou pegue o anel no andar superior, disponível para todas as raças.',
 'Use Night Watchman’s Torch para revelar Ancient Hilt e leve-o a Ealaane Nimbuswalker. Procure Ancient Skyborne Blade em um dos locais registrados e volte para receber Eluvi’ana. A lâmina aparece em locais variáveis.',
 'Aliança: combine 20 Mathystral Amulet Fragments, invoque Baron Marinous e visite Onu. Horda: obtenha Strange Water Globe de Baron Aquanis nas Profundezas Negras e visite Je’neu. Após a entrega, peça o globo de volta.',
 'Equipe Ancient Heirloom e leve o globo ao Highborne Spirit. Mate Narassin para obter Azsharan Key e abra a caixa atrás dele para pegar o tomo. Volte ao espírito e fale com Mordent Evenshade em Shen’dralas (35.05, 46.49).',
 'Star of Elune: use o anel e reúna cinco jogadores no cofre de Feralas. Quatro acionam os interruptores juntos enquanto um entra no cofre. O primeiro interruptor fica no andar superior.',
 'Abyssal Chest: debaixo d’água em Azshara; conclua primeiro a sequência Kirith–Azsharite. Tears of Anguish: após falar com Mordent, derrote Anguished ou Suffering Highborne perto do lago Kel’theril. Esses saques não exigem o anel.',
 'Volte a Mordent. No Shrine of Coalescence, use o globo com os três itens de purificação. Retorne com Cleansed Water Globe e fale com o príncipe Tortheldrin em Gládio Cruel. As próximas etapas e um requisito de reputação Honrado não estão confirmados.',
 'Anel no andar superior', 'Tocha necessária', 'Possível local da lâmina', 'Anel e globo necessários', 'Chave e tomo', 'Cofre para cinco jogadores', 'Ativação simultânea', 'Baú submerso', 'Área de Tears of Anguish', 'Purifique o globo'],
'zh-Hans': ['Dawn Waker：已知路线', '截至11月10日已验证的步骤。结局与最终奖励仍未知。',
 '戒指与剑刃', '水之球', '精灵与书卷', '三种净化材料', '目前的最后一步',
 '通过Coming of Age任务（Skyborne）获得Ancient Heirloom，或前往建筑顶层拾取戒指，所有种族均可拾取。',
 '使用Night Watchman’s Torch显现Ancient Hilt，将其交给Ealaane Nimbuswalker。在已报告的地点寻找Ancient Skyborne Blade，返回领取Eluvi’ana。剑刃的刷新位置不固定。',
 '联盟：合成20个Mathystral Amulet Fragments，召唤Baron Marinous，再去找Onu。部落：在黑暗深渊从Baron Aquanis处获得Strange Water Globe，再去找Je’neu。交付后再次对话取回球体。',
 '装备Ancient Heirloom并携带球体与Highborne Spirit交谈。击杀Narassin获得Azsharan Key，用钥匙打开身后的箱子取得书卷。回到精灵处，再去Shen’dralas找Mordent Evenshade（35.05，46.49）。',
 'Star of Elune：戴上戒指，五人一起前往菲拉斯宝库。四人同时启动开关，一人进入宝库。第一个开关在楼上。',
 'Abyssal Chest：位于艾萨拉水下，须先完成Kirith–Azsharite任务链。Tears of Anguish：与Mordent交谈后，在凯斯利尔湖附近击杀Anguished或Suffering Highborne。获取这些掉落不需要戒指。',
 '回到Mordent处。在Shrine of Coalescence使用球体和三种净化材料。带回Cleansed Water Globe，然后去厄运之槌与托塞德林王子交谈。后续步骤和尊敬声望要求尚未确认。',
 '楼上的戒指', '需要火把', '剑刃可能刷新点', '需要戒指与球体', '钥匙与书卷', '五人宝库', '同时启动开关', '水下宝箱', 'Tears of Anguish获取区域', '净化水之球'],
'zh-Hant': ['Dawn Waker：已知路線', '截至11月10日已驗證的步驟。結局與最終獎勵仍未知。',
 '戒指與劍刃', '水之球', '精靈與書卷', '三種淨化材料', '目前的最後一步',
 '透過Coming of Age任務（Skyborne）取得Ancient Heirloom，或前往建築頂層拾取戒指，所有種族皆可拾取。',
 '使用Night Watchman’s Torch顯現Ancient Hilt，將其交給Ealaane Nimbuswalker。在已回報的地點尋找Ancient Skyborne Blade，返回領取Eluvi’ana。劍刃的刷新位置不固定。',
 '聯盟：合成20個Mathystral Amulet Fragments，召喚Baron Marinous，再去找Onu。部落：在黑暗深淵從Baron Aquanis處取得Strange Water Globe，再去找Je’neu。交付後再次對話取回球體。',
 '裝備Ancient Heirloom並攜帶球體與Highborne Spirit交談。擊殺Narassin取得Azsharan Key，用鑰匙打開身後的箱子取得書卷。回到精靈處，再去Shen’dralas找Mordent Evenshade（35.05，46.49）。',
 'Star of Elune：戴上戒指，五人一起前往菲拉斯寶庫。四人同時啟動開關，一人進入寶庫。第一個開關在樓上。',
 'Abyssal Chest：位於艾薩拉水下，須先完成Kirith–Azsharite任務鏈。Tears of Anguish：與Mordent交談後，在凱斯利爾湖附近擊殺Anguished或Suffering Highborne。取得這些掉落不需要戒指。',
 '回到Mordent處。在Shrine of Coalescence使用球體和三種淨化材料。帶回Cleansed Water Globe，然後去厄運之槌與托塞德林王子交談。後續步驟和尊敬聲望要求尚未確認。',
 '樓上的戒指', '需要火把', '劍刃可能刷新點', '需要戒指與球體', '鑰匙與書卷', '五人寶庫', '同時啟動開關', '水下寶箱', 'Tears of Anguish取得區域', '淨化水之球']
}
texts['es-MX']=texts['es']
marker_names={'ring':'Ancient Heirloom','hilt':'Ancient Hilt','blade':'Ancient Skyborne Blade',
 'spirit':'Highborne Spirit','narassin':'Narassin','vault':'Star of Elune',
 'switch':'Vault Switch','chest':'Abyssal Chest','tears':'Tears of Anguish','shrine':'Shrine of Coalescence'}
coordinates=[
 ('Zephras Isle','41.7, 23.4; 58.13, 24.06; 65.94, 74.37'),
 ('Ancient Skyborne Blade','48.94, 72.68; 50.4, 44.3; 66.25, 43.15; 59.9, 82.2'),
 ('Darkshore / Ashenvale','Baron Marinous: 58.9, 22.6; Onu: 43.6, 76.4; Je’neu: 11.6, 34.2'),
 ('Ashenvale / Darkshore','Highborne Spirit: 15.68, 19.33; Narassin: 56.4, 26.5'),
 ('Feralas','58.5, 71.6; 58.5, 71.0; 57.3, 71.7; 59.7, 72.0; 61.1, 73.6'),
 ('Azshara / Winterspring','66.0, 54.1 / 53.6, 43.2'),
 ('Hyjal','72.7, 37.2')]

def coords(i):
    return '<p><strong>'+coordinates[i][0]+'</strong>: '+coordinates[i][1]+'</p>'

for lang,t in texts.items():
    headings=[{'id':k,'title':t[i+2],'depth':2} for i,k in enumerate(['ring-and-blade','water-globe','spirit-and-tome','cleansing-items','known-endpoint'])]
    blocks=[[t[7],t[8]],[t[9]],[t[10]],[t[11],t[12]],[t[13]]]
    body=''
    for i,(heading,paragraphs) in enumerate(zip(headings,blocks)):
        body+=f'<h2 id="{heading["id"]}">{html.escape(heading["title"])}</h2>'
        body+=''.join('<p>'+html.escape(p)+'</p>' for p in paragraphs)
        body+=''.join(coords(j) for j in [[0,1],[2],[3],[4,5],[6]][i])
    guide={'id':'dawn-waker','group':'world','title':t[0],'intro':t[1],'headings':headings,'html':body}
    prefix='public/data/guides' if lang=='en' else f'public/data/guides/locales/{lang}'
    h.save(f'{prefix}/dawn-waker.json',guide)
    index_path=f'{prefix}/index.json' if lang=='en' else f'{prefix}/index-v2.json'
    index=h.read(index_path) if (h.ROOT/index_path).exists() else h.read(f'{prefix}/index.json')
    if lang=='en':
        index['guides']=[g for g in index['guides'] if g['id']!='dawn-waker']+[{k:v for k,v in guide.items() if k!='html'}]
    else: index['summaries']['dawn-waker']={k:guide[k] for k in ['title','intro']}
    h.save(index_path,index)
    if lang!='en':
        # Older released apps require exact parity with their pinned English
        # guide list. Keep that legacy locale index intact on the shared channel.
        h.save(f'{prefix}/index.json',h.baseline(f'{prefix}/index.json'))
    app=h.read(f'src/i18n/locales/{lang}.json')
    app['map']['dawnWaker']={'label':'Dawn Waker','ring':t[14], 'hilt':t[15], 'blade':t[16], 'spirit':t[17],
        'narassin':t[18], 'vault':t[19], 'switch':t[20], 'chest':t[21], 'tears':t[22], 'shrine':t[23],
        'ringDescription':t[7], 'hiltDescription':t[8], 'bladeDescription':t[8], 'spiritDescription':t[10],
        'narassinDescription':t[10], 'vaultDescription':t[11], 'switchDescription':t[11],
        'chestDescription':t[12], 'tearsDescription':t[12], 'shrineDescription':t[13]}
    for kind,name in marker_names.items():
        app['map']['dawnWaker'][kind]=name+' · '+app['map']['dawnWaker'][kind]
    h.save(f'src/i18n/locales/{lang}.json',app)

# Reuse the map's established source-to-atlas transformation, retaining its inset handling.
source=(h.ROOT/'data/site-research/wowhead-audit-2026-11-06/world-map.js').read_text(encoding='utf-8-sig')
world={m[1]:json.loads(m[2]) for line in source.splitlines() if (m:=re.match(r'WH.setPageData\("wow.worldMap.classicplus.([^"]+)",(.+)\);',line))}
atlas=h.read('public/maps/world-atlas/metadata.json')
def project(region,x,y):
    z=next(z for z in world['places'] if z['name']==region and 'rect' in z)
    cx=z['rect'][0][0]+x/100*(z['rect'][1][0]-z['rect'][0][0])
    cy=z['rect'][0][1]+y/100*(z['rect'][1][1]-z['rect'][0][1])
    c=next(c for c in world['config']['continents'] if c['canvasX']<=cx<c['canvasX']+c['width'] and c['canvasY']<=cy<c['canvasY']+c['height'])
    layer=next(l for l in atlas['terrainLayers'] if l.get('source',{}).get('mapId')==c['map'])
    inset=layer['source'].get('placement')=='overview-inset'
    ax=layer['originX']+(cx-c['canvasX']+((c['originCol']-layer['source']['grid']['minX'])*c['pxPerChunk'] if inset else 0))*layer['scaleX']
    ay=layer['originY']+(cy-c['canvasY']+((c['originRow']-layer['source']['grid']['minY'])*c['pxPerChunk'] if inset else 0))*layer['scaleY']
    assert 0<=ax<=atlas['bounds']['maxX'] and 0<=ay<=atlas['bounds']['maxY']
    return round(ax,3),round(ay,3)
points=[('ring','Zephras Isle',41.7,23.4),('hilt','Zephras Isle',58.13,24.06),
 *[('blade','Zephras Isle',x,y) for x,y in [(48.94,72.68),(50.4,44.3),(66.25,43.15),(59.9,82.2)]],
 ('spirit','Ashenvale',15.68,19.33),('narassin','Darkshore',56.4,26.5),('vault','Feralas',58.5,71.6),
 *[('switch','Feralas',x,y) for x,y in [(58.5,71.0),(57.3,71.7),(59.7,72.0),(61.1,73.6)]],
 ('chest','Azshara',66,54.1),('tears','Winterspring',53.6,43.2),('shrine','Mount Hyjal',72.7,37.2)]
path='public/maps/world-atlas/locations-forever-all-quests.json'
data=h.read(path)
data['locations']=[p for p in data['locations'] if not p['id'].startswith('dawn-waker-')]
for i,(kind,region,x,y) in enumerate(points):
    ax,ay=project(region,x,y)
    data['locations'].append({'id':f'dawn-waker-{kind}-{i+1}', 'name':marker_names[kind],
        'nameKey':f'map.dawnWaker.{kind}', 'category':'quest', 'subtype':'forever-all-quest', 'label':'Dawn Waker',
        'labelKey':'map.dawnWaker.label','x':ax,'y':ay,'regionId':'','region':region,'referenceCoordinates':{'x':x,'y':y},
        'descriptionKey':f'map.dawnWaker.{kind}Description','questInfo':{'faction':'Both'}})
h.save(path,data)
# Append to the existing search locations: source-shard numeric indices must
# never be shifted by sorting or rebuilding unrelated entries.
search_path='public/data/map-search/index.json'
search=h.read(search_path)
for point in data['locations'][-len(points):]:
    row={'mapId':'azeroth','mapName':'Azeroth','point':point,'names':[point['name'],'Dawn Waker'],'count':1}
    existing=next((i for i,entry in enumerate(search['locations']) if entry['point']['id']==point['id']),None)
    if existing is None:search['locations'].append(row)
    else:search['locations'][existing]=row
original=h.baseline(search_path)
search['source']['markerCount']=original['source']['markerCount']+len(points)
h.save(search_path,search)
(h.AUDIT/'dawn-waker-markers.json').write_text(json.dumps({'source':'https://www.wowhead.com/forever/guide/dawn-waker-secret-walkthrough',
    'markers':data['locations'][-len(points):], 'note':'Blade markers are observed alternative spawns; tears marker is a farming area, not a single NPC spawn.'},ensure_ascii=False,indent=2),encoding='utf8')
h.receipt()
