import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Resolve the same local catalogs used by the desktop detail components. Keep
// reusable quest/item/boss documents separate from individual map locations.
export async function createAddonDetails(root, en, points) {
  const read = async file => JSON.parse(await readFile(path.join(root, 'public/data', file), 'utf8'));
  const files = ['quests/quest-details.json', 'quests/requirements.json', 'quests/step-locations.json',
    'vendors/inventories.json', 'rares/details.json', 'items/catalog.json', 'books/forever-library-books.json',
    'reference/dungeons/client-instances.json', 'dungeons/journal.json', 'dungeons/boss-guides.json',
    'dungeons/foreverdb-bosses.json', 'dungeons/loot-items.json', 'dungeons/wowhead-notable-loot.json',
    'dungeons/observed-quests.json', 'dungeons/excavation-site-wetlands.json'];
  const [quests, requirements, steps, vendors, rares, items, books, references, journal, guides, rosters,
    loot, notable, observed, wetlands] = await Promise.all(files.map(read));
  const t = key => typeof key === 'string' ? key.split('.').reduce((v,k) => v?.[k],en) ?? key : key;
  const L = en.mapAddonPrototype;
  const itemMap = new Map(items.items.map(i => [String(i.id),i]));
  const itemByName = new Map(items.items.map(i => [i.name,i]));
  for(const p of points) for(const q of p.questOffers??[]) {
    quests.quests[q.id]={title:q.name,...q,...quests.quests[q.id]};
  }
  const rareMap = new Map(rares.entries.map(i => [String(i.id),i]));
  const pointMap = new Map(points.map(p => [p.id,p]));
  const documents = {}, missing = new Set(), stats = {};
  // Export semantic tab IDs once; the native UI never guesses from translated headings.
  const sectionTabs = new Map([
    [L.detailBosses, 'bosses'], [L.detailQuests, 'quests'], [L.detailInventory, 'inventory'],
    [L.detailLoot, 'loot'], [L.detailRewards, 'rewards'], [L.detailChooseReward, 'rewards'],
    [L.detailQuestSteps, 'route'], [L.detailPreviousQuests, 'route'],
    [L.detailFollowingQuests, 'route'], [L.detailQuestChain, 'route'],
    [L.detailDroppedBy, 'related'], [L.detailRelated, 'related'],
  ]);
  const section = (title, text = '', links = [], tab = sectionTabs.get(title) ?? 'overview') =>
    ({title, text: String(text), links, tab});
  const fact = (label,value) => value === undefined || value === null || value === '' ? '' : `${label}: ${Array.isArray(value) ? value.join(', ') : value}`;
  const lines = values => values.filter(v => v !== undefined && v !== null && v !== '').join('\n');
  const money = n => `${Math.floor(n/10000)}g ${Math.floor(n/100)%100}s ${n%100}c`;
  const name = p => t(p?.nameKey) || p?.name || p?.id || '';
  const mark = (category,source) => { const record=stats[category] ??= {}; record[source]=(record[source]??0)+1; };
  const icon = value => value ? `Interface\\Icons\\${path.basename(value).replace(/\.[^.]+$/,'')}` : '';
  const link = (label,target,meta='') => ({label:String(label),target,meta:String(meta)});
  const itemLink = (i, meta='') => {
    const id=String(typeof i==='object'?i.id:i), data=typeof i==='object'?i:{};
    const target=itemDocument(id,data);
    return link(data.name || itemMap.get(id)?.name || loot.items[id]?.name || `${L.detailItem} ${id}`,target,
      lines([data.quantity>1 ? `×${data.quantity}` : '',meta]));
  };
  function itemDocument(id,fallback={}) {
    const key=`item:${id}`; if (documents[key]) return key;
    const item=loot.items[id] ? {...itemMap.get(id),...loot.items[id]} : itemMap.get(id) ?? fallback;
    if (!item.name) missing.add(key);
    const sections=[];
    documents[key]={title:item.name || `${L.detailItem} ${id}`,category:L.detailItem,icon:icon(item.icon),sections};
    const client=item.clientDetails ?? {};
    sections.push(section(L.detailOverview,lines([
      item.category,item.grade,fact(L.detailItemLevel,item.itemLevel),fact(L.detailRequiredLevel,item.usageLevel),
      fact(L.detailSlot,item.slot),fact(L.detailClasses,item.allowedClasses?.map(c=>typeof c==='string'?c:c.name)),
      fact(L.detailStack,client.stackSize),client.sellPriceCopper!==undefined?fact(L.detailSellPrice,money(client.sellPriceCopper)):'',
      client.itemDelayMs ? fact(L.detailSpeed,`${client.itemDelayMs/1000}s`) : '',
      client.bonding ? t(`database.clientItem.binding.${client.bonding}`) : '',item.description,
    ])));
    const itemStats=[...(item.stats??[]),...(item.sections??[]).flatMap(s=>s.stats??[])];
    if(itemStats.length) sections.push(section(L.detailStats,lines(itemStats.map(s=>`${t(s.label)}: ${s.value}`))));
    if(item.siteEffects?.length) sections.push(section(L.detailEffects,lines(item.siteEffects.map(e=>e.text))));
    for(const set of item.itemSets??[]) sections.push(section(set.name,
      lines((set.bonuses??[]).map(b=>`${b.requiredPieces}: ${b.spellName}`)),(set.members??[]).map(i=>itemLink(i)), 'sets'));
    if(!itemMap.has(id)&&!loot.items[id]) sections.push(section(L.detailItem,L.detailUnavailable));
    for(const s of item.sections??[]) if(s.text || s.description) sections.push(section(t(s.title??s.key),s.text??s.description));
    return key;
  }
  function questDocument(id,override={}) {
    id=String(id); const key=`quest:${id}${override.dungeonId?':'+override.dungeonId:''}`;
    if(documents[key]) return key;
    const q={...quests.quests[id],...override}; const sections=[];
    documents[key]={title:q.title||q.name||`${L.detailQuest} ${id}`,category:L.detailQuest,sections};
    if(!quests.quests[id]&&!q.objective&&!q.title) missing.add(key);
    const req=requirements.quests[id]??{};
    sections.push(section(L.detailOverview,lines([
      fact(L.detailLevel,q.level),fact(L.detailRequiredLevel,q.minimumLevel),fact(L.detailFaction,q.faction),
      fact(L.detailQuestGiver,q.giver ? [q.giver.name,q.giver.where].filter(Boolean).join(' — ') : q.startsAt),
      fact(L.detailTurnIn,q.turnIn?.name??q.endsAt),fact(L.detailRequiredReputation,q.requiredReputation),
      fact(L.detailClasses,req.classes?.map(c=>c.name)),fact(L.detailRaces,req.races?.map(c=>c.name)),
      fact(L.detailProfession,req.profession?.name),
      req.skillObjective?fact(L.detailSkill,`${t(`professions.names.${req.skillObjective.professionKey}`)} ${req.skillObjective.level}`):'',
      fact(L.detailLearnProfession,req.learnProfession?.name),
    ])));
    for(const [field,label] of [['objective',L.detailObjective],['description',L.detailDescription],['progressText',L.detailProgress],['completionText',L.detailCompletion]])
      if(q[field]) sections.push(section(label,q[field]));
    const objectives=[...(q.objectiveItems??[]),...(q.objectiveItem?[q.objectiveItem]:[])];
    if(objectives.length) sections.push(section(L.detailRequiredItems,'',objectives.map(i=>itemLink(i))));
    if(req.providedItems?.length) sections.push(section(L.detailProvidedItems,'',req.providedItems.map(i=>itemLink(i))));
    if(req.prerequisiteQuests?.length) sections.push(section(L.detailPreviousQuests,'',req.prerequisiteQuests.map(q=>link(q.title||q.name||`${L.detailQuest} ${q.id}`,questDocument(q.id)))));
    const rewards=q.rewardItems??(!q.rewardChoice?q.rewards:[])??[];
    const choices=q.rewardChoices??(q.rewardChoice?q.rewards:[])??[];
    const rewardText=lines([q.reward,fact(L.detailExperience,q.experience),fact(L.detailMoney,q.money),
      fact(L.detailReputation,q.reputation),...(q.currencyRewards??[]).map(c=>`${c.name} ×${c.quantity}`)]);
    if(rewardText||rewards.length) sections.push(section(L.detailRewards,rewardText,rewards.map(i=>itemLink(i))));
    if(choices.length) sections.push(section(L.detailChooseReward,'',choices.map(i=>itemLink(i))));
    const route=steps.quests[id];
    if(route){
      const location=p=>[p.name,p.zone,p.zoneX!==undefined?`${p.zoneX}, ${p.zoneY}`:''].filter(Boolean).join(' — ');
      sections.push(section(L.detailQuestSteps,lines([
        ...(route.pickup??[]).map(p=>`${L.detailQuestGiver}: ${location(p)}`),
        ...(route.objectives??[]).flatMap(o=>[o.name,...(o.locations??[]).map(location)]),
        ...(route.handIn??[]).map(p=>`${L.detailTurnIn}: ${location(p)}`),
      ])));
      for(const [field,label] of [['earlier',L.detailPreviousQuests],['following',L.detailFollowingQuests]])
        if(route[field]?.length) sections.push(section(label,'',route[field].map(qid=>link(quests.quests[qid]?.title||`${L.detailQuest} ${qid}`,questDocument(qid)))));
    }
    if(q.chain?.length) sections.push(section(L.detailQuestChain,lines(q.chain)));
    return key;
  }
  function dungeonQuests(id) {
    const seen=new Map();
    if(id===wetlands.dungeonId) for(const q of wetlands.quests) seen.set(q.id,q);
    for(const q of observed.quests.filter(q=>q.dungeonId===id)) seen.set(q.id,{...seen.get(q.id),...q,faction:seen.get(q.id)?.faction??q.faction});
    for(const q of journal.quests[id]??[]) seen.set(q.id,{...quests.quests[q.id],...seen.get(q.id),...q});
    return [...seen.values()];
  }
  function dungeonDocument(id,p={}) {
    const key=`dungeon:${id}`; if(documents[key]) return key;
    const entry=references.entries[id]; if(!entry){missing.add(key);return null;}
    const sections=[]; documents[key]={title:entry.name,category:L.detailDungeon,sections};
    const prep=en.dungeonPreparation.entries[id]??{};
    const suggested=journal.suggestedLevels[id];
    sections.push(section(L.detailOverview,lines([
      suggested?fact(t('dungeonJournal.suggestedLevels'),suggested.join('–')):'',
      fact(t('map.instanceFacts.groupSize'),p.instanceFacts?.groupSize??entry.adventure?.partySize??(entry.adventure?.kind==='party'?5:undefined)),
      fact(t('map.instanceFacts.minimumEntryLevel'),p.instanceFacts?.minimumEntryLevel),
      ...(entry.facts??[]).filter(f=>!suggested||!['map.instanceFacts.betaLevelRange','map.instanceFacts.betaAvailable'].includes(f.label)).map(f=>fact(t(f.label),typeof f.value==='boolean'?(f.value?L.detailYes:L.detailNo):f.value)),
    ])));
    for(const [field,label] of [['entrance','entrance'],['requirements','requirements'],['quests','quests']])
      if(prep[field]) sections.push(section(t(`dungeonPreparation.${label}`),Array.isArray(prep[field])?lines(prep[field]):prep[field], [], 'overview'));
    const notes=en.dungeonPreparation.encounterNotes?.[id]; if(notes?.length) sections.push(section(t('dungeonPreparation.runNotes'),lines(notes)));
    const guide=guides.entries[id]??journal.bossLoot[id]; const roster=rosters.entries[id];
    const encounters=entry.instanceEncounters?.length?entry.instanceEncounters:p.instanceEncounters;
    const names=guide?.bosses.map(b=>b.name)??(encounters?.length?encounters.map(b=>t(b.nameKey)):roster?.bosses??[]);
    const bossLinks=names.map((bossName,index)=>{
      const boss=guide?.bosses.find(b=>b.name===bossName)??{};
      const mech=roster?.mechanics?.[bossName]; const bossKey=`boss:${id}:${index}`;
      const bossSections=[]; documents[bossKey]={title:bossName,category:L.detailBoss,sections:bossSections};
      if(boss.tipKey) bossSections.push(section(L.detailStrategy,t(boss.tipKey)));
      if(mech?.level) bossSections.push(section(L.detailLevel,mech.level));
      const abilities=boss.abilities?.length?boss.abilities:mech?.abilities??[];
      if(abilities.length) bossSections.push(section(L.detailAbilities,lines(abilities.map(a=>lines([a.name,a.descriptionKey?t(a.descriptionKey):'',a.target?fact(L.detailTarget,t(`bossGuide.targets.${a.target}`)):'',a.intervalSeconds?fact(L.detailInterval,`${a.intervalSeconds}s`):''])))));
      const ids=[...new Set([...(boss.loot??[]),...(notable[id]?.bosses?.[bossName]??[])])];
      bossSections.push(section(L.detailLoot,ids.length?'':t('dungeonJournal.noBossLoot'),ids.map(i=>itemLink(i))));
      return link(bossName,bossKey,`${ids.length} ${L.detailLoot.toLowerCase()}`);
    });
    if(bossLinks.length) sections.push(section(L.detailBosses,'',bossLinks));
    const qs=dungeonQuests(id);
    if(qs.length) sections.push(section(L.detailQuests,'',qs.map(q=>link(q.title,questDocument(q.id,{...q,dungeonId:id}),lines([fact(L.detailLevel,q.level),q.faction])))));
    for(const s of entry.sections??[]) sections.push(section(t(s.title),lines([s.text,s.description,...(s.facts??[]).map(f=>fact(t(f.label),t(f.value)))])));
    return key;
  }
  function forMarker(p) {
    const sections=[];
    const add=(source,s)=>{ if(s && (s.text || s.links?.length)){ sections.push(s);mark(p.category,source); } };
    const label=t(p.detailLabelKey)||p.detailLabel||t(p.labelKey)||p.label;
    if(label) add('label',section(L.detailCategory,label));
    const ref=p.reference;
    if(['dungeon','raid'].includes(p.category)||ref?.category==='dungeons') {
      const id=ref?.id==='796'?'scarlet-monastery':ref?.id??p.id;
      const target=dungeonDocument(id,p);
      if(target) for(const s of documents[target].sections) add('dungeon',s);
    }
    const qid=p.questId??quests.markerQuestIds[p.id]; const dq=quests.markerDungeonQuests?.[p.id];
    if(qid||dq){
      const override=dq?dungeonQuests(dq.dungeonId).find(q=>q.id===dq.id)??{}:{};
      const target=questDocument(qid??dq.id,override);
      for(const s of documents[target].sections) add('quest',s);
    }
    if(p.questOffers?.length) add('quest-offers',section(L.detailQuests,'',p.questOffers.map(q=>link(q.name,questDocument(q.id),lines([fact(L.detailLevel,q.level),q.kind])))));
    for(const id of p.questNpcDungeonIds??[]) {
      const qs=dungeonQuests(id).filter(q=>!p.questNpcNameKey||q.giver?.name===t(p.questNpcNameKey)||q.turnIn?.name===t(p.questNpcNameKey));
      if(qs.length) add('dungeon-quests',section(references.entries[id]?.name??L.detailQuests,'',qs.map(q=>link(q.title,questDocument(q.id,{...q,dungeonId:id}))), 'quests'));
    }
    const inventory=vendors.vendors[vendors.markers[p.id]??p.entityId];
    if(inventory) add('vendor',section(L.detailInventory,t('map.vendorInventory.priceNote'),inventory.map(i=>itemLink(i,lines([
      i.copper!==undefined?fact(L.detailPrice,money(i.copper)):'',i.stock!==undefined?fact(L.detailStock,i.stock):'',
      ...(i.currencies??[]).map(([id,n])=>`${L.detailCurrency} ${id} ×${n}`),
      ...(i.items??[]).map(([id,n])=>`${itemMap.get(String(id))?.name??`${L.detailItem} ${id}`} ×${n}`),
    ])))));
    const rare=rareMap.get(String(p.entityId));
    if(rare){
      add('rare',section(L.detailCreature,lines([rare.classification,rare.type?t(`map.rares.types.${rare.type}`):'',
        fact(L.detailLevel,rare.levelRange??rare.level),fact(L.detailHealth,rare.health),fact(L.detailMana,rare.mana),
        rare.tameable!==undefined?fact(L.detailTameable,rare.tameable?L.detailYes:L.detailNo):'',rare.partial?t('map.rares.partialDetails'):''])));
      if(rare.drops) add('rare-drops',section(L.detailLoot,rare.drops.length?'':t('map.rares.noDropsListed'),rare.drops.map(i=>itemLink(i,
        lines([i.percent!==undefined?`${i.percent}%`:'',i.observed!==undefined&&i.sampleSize!==undefined?`${i.observed}/${i.sampleSize} ${L.detailObserved}`:''])))));
    }
    if(p.trainerTitleKey||p.trainerTitle||p.trainerClassKey||p.trainerClass) add('trainer',section(L.detailTrainer,lines([
      t(p.trainerTitleKey)||p.trainerTitle,t(p.trainerClassKey)||p.trainerClass,p.trainerFaction,
    ])));
    if(p.petLevels||p.petAbilities) add('pet',section(L.detailPet,lines([
      fact(L.detailLevel,p.petLevels),...(p.petAbilities??[]).map(a=>a.name),
    ])));
    const itemId=p.itemId??(p.category.startsWith('gatherable-')?itemByName.get(name(p))?.id:undefined);
    if(itemId) add('item',section(L.detailItem,'',[itemLink(itemId)]));
    if(p.droppedBy?.length) add('drop-sources',section(L.detailDroppedBy,lines(p.droppedBy.map(n=>n.name))));
    const book=books.books.find(b=>b.id===p.bookId);
    if(book) add('book',section(book.name,lines(book.locations.map(l=>`${l.zone} — ${l.x}, ${l.y}\n${l.where}`))));
    const routeGroups=[...(p.linkedMarkers?.length?[{titleKey:p.linkedMarkersTitleKey,links:p.linkedMarkers}]:[]),...(p.linkedMarkerGroups??[])];
    for(const g of routeGroups) {
      const ls=g.links??g.markers??[];
      add('links',section(t(g.titleKey)||L.detailRelated,'',ls.map(l=>{
        const point=pointMap.get(l.markerId);return link(t(l.nameKey)||l.name||name(point),`marker:${l.markerId}`,t(l.detailKey)||l.detail||'');
      }), 'related'));
    }
    return sections;
  }
  const unavailableLinks=[];
  function finalize(markers) {
    const ids=new Set(markers.map(p=>p.id));
    const aliases=new Map(points.filter(p=>ids.has(p.id)).flatMap(p=>(p.aliasIds??[]).map(id=>[id,p.id])));
    for(const marker of markers) for(const s of marker.detailSections) for(const entry of s.links) {
      if(!entry.target.startsWith('marker:')) continue;
      const id=entry.target.slice(7), resolved=ids.has(id)?id:aliases.get(id);
      if(resolved) entry.target=`marker:${resolved}`;
      else {unavailableLinks.push({markerId:marker.id,target:id});entry.target='';}
    }
  }
  return { forMarker, documents, finalize, report:()=>({sources:files,byCategory:stats,unresolved:[...missing].sort(),unavailableMapLinks:unavailableLinks}) };
}
