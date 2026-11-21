import { getPlaceIconPath, getPlaceSymbolPath } from '../src/features/map/gta6-place-icons.mjs';
const normalized = value => value.toLowerCase().replace(/[?"']/g, '').replace(/\s+/g, ' ').trim();
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const cleanName = name => name.replace(/\s*\((?:\d+|[NSEW])\)\s*\??$/i,'').replace(/\s*#\d+\s*\??$/,'').replace(/\(\?\)|\?/g,'').replace(/^"|"$/g,'').trim();
const parts = record => record.landmark.inGameAddress.split(',').map(s=>s.trim());
const region = record => parts(record).slice(1).join(', ');
const unnamed = record => record.landmark.nameStatus === 'unknown';
const technical = record => /^(?:turn\s+\d|room\s+\d|prison (?:tower|building))/i.test(record.name);
const placeIcon = getPlaceIconPath;

/** Classification uses game-side tags and names, never a real-world building's function. */
export function classifyLandmark(record) {
 const tags=new Set(record.landmark.tags), name=cleanName(record.name).toLowerCase();
 if(tags.has('#ferriswheel'))return 'place-leisure';
 if(name==='res trade paint')return 'place-retail';
 if(name==='the atoll bar & grill')return 'place-restaurant';
 const rules=[
  ['airport',['#airport','#airbase','#blimp'],/airport|airfield|air station|hangar|helipad|blimp/],
  ['marina',['#marina'],/marina|harbou?r|dock|container crane/],
  ['rail',['#metro','#metromover','#train'],/metro|metromover|train station|railway/],
  ['gas',['#gas'],/gas station/],['police',['#police'],/police|sheriff/],['hospital',['#hospital','#pharmacy'],/hospital|medical cent(?:er|re)|pharmacy/],
  ['shops',['#supermarket','supermarket','#clothes','#shoes','#guns','#vendor','#fence','fence','#liquor','#electronics'],/supermarket|grocery|clothing|fashions|pawn|liquor|ammu.nation|gadgets/],
  ['restaurant',['#food','#fastfood','#bar','#drinks','restaurant'],/restaurant|diner|cafe|café|seafood|cuban foods|waffles|deli|shrimp shack/],
  ['repair',['#modshop',"#pay'n'spray",'#carwash'],/customs|repair|salvage|auto parts|tires|paradise garage/],
  ['leisure',['#nightclub','#stripclub','#gym','#golf','#tennis','#cinema','#ferriswheel','#racetrack','recreation','leisure'],/rac(?:e|ing)way|golf|cinema|movie screen|ferris|stadium|arena|nightclub|theat(?:er|re)|ballet|opera|tennis|basketball|skate park|playground|sports|swimming|stage/],
  ['natural',['natural'],/^(?:lake|river|forest|park|mount |reservoir|waterfall|cave|pond|rock formation)|fairyland forest|domed hills|\b(?:bay|river|canal)$/],
  ['hotel',['hotel'],/hotel|motel|resort/],['industrial',['industrial'],/warehouse|factory|distribution|refinery|dry dock|industrial|^tank/],
  ['government',['government','#jail'],/prison|bunker|government|city hall|courthouse/],
  ['utilities',['utilities'],/water tower|cell tower|radio mast|power station|radar|substation/],
  ['residential',['residential','#safehouse'],/\bhouse\b|apartment|residences|condominium/],
  ['office',['office'],/office|\bhq\b|financial cent(?:er|re)|\btower\b/],
  ['construction',['construction'],/construction/],['agriculture',['agriculture'],/\bfarm\b|ranch/],
  ['transportation',['transportation','#bus'],/bridge|parking|car park|bus stop|intersection|roundabout|interchange|tunnel|highway|road|street/],
  ['public',['public'],/museum|church|school|library|fire station/],['retail',['retail'],/\bstore\b|\bshop\b|\bmall\b/],['mixed',['mixed'],/$a/],
 ];
 for(const [id,keys,pattern] of rules)if(keys.some(t=>tags.has(t))||(!unnamed(record)&&pattern.test(name)))return 'place-'+(id==='shops'?'retail':id);
 return 'place-landmark';
}

export function curateLandmarks(raw, {mergeOnlyAnonymousIds=[], excludedAnonymousRanges=[], townAnchorIds=[]}={}) {
 const mergeOnly=new Set(mergeOnlyAnonymousIds);
 const townAnchors=new Set(townAnchorIds);
 const excluded = raw.filter(record => {
   if (!unnamed(record) || !/^L\d+$/.test(record.landmark.id)) return false;
   const number = Number(record.landmark.id.slice(1));
   return excludedAnonymousRanges.some(([first, last]) => number >= first && number <= last);
 });
 const excludedIds = new Set(excluded.map(record => record.landmark.id));
 const rows=raw.filter(r=>!excludedIds.has(r.landmark.id)).map(r=>({...r,landmark:{...r.landmark,tags:[...r.landmark.tags]},category:classifyLandmark(r)}));
 const byId=new Map(rows.map(r=>[r.landmark.id,r]));
 const parent=new Map(rows.map(r=>[r.id,r.id]));const reason=new Map();
 const root=id=>{while(parent.get(id)!==id)id=parent.get(id);return id};
 const merge=(child,anchor,why)=>{const a=root(child.id),b=root(anchor.id);if(a!==b){parent.set(a,b);reason.set(child.id,why)}};
 const named=rows.filter(r=>!unnamed(r)&&r.landmark.gameCoordinates);
 const names=new Map();for(const row of named){const key=normalized(cleanName(row.name));names.set(key,[...(names.get(key)??[]),row])}
 // Addresses explicitly identify a parent site (racecourse turns, prison wings, airport buildings).
 for(const row of rows.filter(r=>r.landmark.gameCoordinates)) {
   const labels=parts(row).slice(1);
   for(const label of labels){const candidates=(names.get(normalized(label))??[]).filter(p=>p.id!==row.id&&distance(row,p)<2200);
     if(candidates.length&& (unnamed(row)||technical(row)||/^(?:main |terminal|building|hangar|gate\b)/i.test(row.name))){
       candidates.sort((a,b)=>distance(row,a)-distance(row,b));merge(row,candidates[0],'explicit-parent-address');break;
     }
   }
 }
 // Duplicate points within one venue merge; separate branches retain their own positions.
 const sameVenue=(a,b)=>{
   const gap=distance(a,b);
   if(gap>180)return false;
   const sharedAddress=normalized(a.landmark.realWorldAddress)===normalized(b.landmark.realWorldAddress)
     && /\d.*(?:street|road|avenue|blvd|hwy|st\b|rd\b|ave\b|dr\b|cswy|\+[a-z0-9]+)/i.test(a.landmark.realWorldAddress);
   // Chain outlets and generic structures are not one place merely because they are nearby.
   const independent=/gas station|warehouse|bridge|pier|tank|parking|metro station|lifeguard tower|tennis court|radio tower|water tower|cell tower|radio mast|bus stop|container crane/i.test(a.name);
   return !independent||sharedAddress||gap<=35;
 };
 const groups=new Map();for(const row of named){const key=normalized(cleanName(row.name))+'|'+normalized(region(row));groups.set(key,[...(groups.get(key)??[]),row])}
 for(const group of groups.values()){
   const anchors=[];for(const row of group.sort((a,b)=>Number(Boolean(b.landmark.gamePhoto))-Number(Boolean(a.landmark.gamePhoto))||a.id.localeCompare(b.id))){
     const anchor=anchors.find(p=>sameVenue(p,row));if(anchor)merge(row,anchor,'same-place-nearby');else anchors.push(row);
   }
 }
 // Reviewed against the original map: Route 183 separates these two compounds.
 const reviewed=[
  {anchor:'L3391',members:['L3392','L3393']},
  {anchor:'L1082',members:['L1083','L1084','L1085','L1431']},
 ];
 for(const site of reviewed)for(const id of site.members)if(byId.has(id))merge(byId.get(id),byId.get(site.anchor),'reviewed-compound');
 // Named prison wings and perimeter towers belong to the nearby main prison.
 for(const anchor of named.filter(r=>/^main prison building$/i.test(r.name))) {
   for(const row of named) if(row.id!==anchor.id && /^prison (?:tower|building)/i.test(row.name)
     && distance(row,anchor)<400)merge(row,anchor,'prison-compound');
 }
 // Region references remain region markers, separate from named facilities.
 // Bounded groups compare against one fixed anchor, never a transitive proximity chain.
 const areaAnchors=new Map();
 const reviewedIds=new Set(reviewed.flatMap(site=>[site.anchor,...site.members]));
 // New anonymous references may join existing areas, but cannot displace their anchors.
 for(const row of rows.filter(r=>unnamed(r)&&r.landmark.gameCoordinates&&root(r.id)===r.id)
   .sort((a,b)=>Number(townAnchors.has(b.landmark.id))-Number(townAnchors.has(a.landmark.id))
     ||Number(mergeOnly.has(a.landmark.id))-Number(mergeOnly.has(b.landmark.id)))) {
   const key=normalized(region(row)), anchors=areaAnchors.get(key)??[];
   const anchor=anchors.find(p=>townAnchors.has(p.landmark.id) || (!reviewedIds.has(row.landmark.id)&&!reviewedIds.has(p.landmark.id)&&distance(row,p)<=180));
   if(anchor)merge(row,anchor,'repeated-area-reference');else anchors.push(row);
   areaAnchors.set(key,anchors);
 }
 const members=new Map();for(const row of rows){const id=root(row.id);members.set(id,[...(members.get(id)??[]),row])}
 const output=[],audit=excluded.map(record => ({decision:'excluded-anonymous', ids:[record.landmark.id], name:region(record)}));
 for(const [id,group] of members){const anchor=rows.find(r=>r.id===id);
   if(unnamed(anchor)&&group.every(r=>mergeOnly.has(r.landmark.id))){
     audit.push({decision:'hidden-anonymous-reference',ids:group.map(r=>r.landmark.id),name:region(anchor)});continue;
   }
   const areaLabel=unnamed(anchor)?cleanName(region(anchor)):null;
   const town=areaLabel&&townAnchors.has(anchor.landmark.id);
   if(/^(?:turn\s+\d|room\s+\d)/i.test(anchor.name)&&!anchor.landmark.gamePhoto){audit.push({decision:'hidden-technical-component',ids:group.map(r=>r.landmark.id),name:anchor.name});continue;}
   const photo=anchor.landmark.gamePhoto??group.find(r=>r.landmark.gamePhoto)?.landmark.gamePhoto;
   const description=anchor.landmark.description??group.find(r=>r.landmark.description)?.landmark.description;
   const tags=[...new Set(group.flatMap(r=>r.landmark.tags))].filter(t=>!['unclassified','other'].includes(t));
   const result={...anchor,name:areaLabel||cleanName(anchor.name),...(areaLabel?{areaLabel:true,category:town?'place-town':'place-landmark'}:{}),iconPath:areaLabel?getPlaceSymbolPath(town?'town':'area'):placeIcon(anchor),landmark:{...anchor.landmark,tags,...(photo?{gamePhoto:photo}:{}),...(description?{description}:{})},memberIds:group.map(r=>r.id),aliasIds:group.filter(r=>r.id!==anchor.id).map(r=>r.id)};
   // The anchor's coordinates and status remain source-backed; no fabricated centroid.
   output.push(result);audit.push({decision:group.length>1?'merged-site':'retained-place',anchor:anchor.landmark.id,name:result.name,ids:group.map(r=>r.landmark.id),reasons:[...new Set(group.map(r=>reason.get(r.id)).filter(Boolean))]});
 }
 const aliases=Object.fromEntries(output.flatMap(r=>r.memberIds.filter(id=>id!==r.id).map(id=>[id,r.id])));
 return {records:output,aliases,audit,report:{rawRecords:raw.length,excludedAnonymous:excluded.length,visibleRecords:output.length,placed:output.filter(r=>r.landmark.gameCoordinates).length,unplaced:output.filter(r=>!r.landmark.gameCoordinates).length,mergedSites:audit.filter(r=>r.decision==='merged-site').length,hiddenAnonymous:audit.filter(r=>r.decision==='hidden-anonymous-reference').reduce((n,r)=>n+r.ids.length,0),hiddenTechnical:audit.filter(r=>r.decision==='hidden-technical-component').reduce((n,r)=>n+r.ids.length,0),towns:output.filter(r=>r.category==='place-town').length}};
}
