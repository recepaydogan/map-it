import artwork from './gta6-marker-artwork.json' with { type: 'json' };

// A venue's specific game-side identity takes precedence over broad source
// categories (for example, "landmark" does not make a stadium a camera).
const namedVenues = {
  'dock ring': 'ferris-wheel', 'vice city casino racetrack': 'sports-score',
  'res trade paint': 'storefront', 'the atoll bar & grill': 'restaurant',
  'fleeca field': 'stadium', 'megamundo': 'location-city',
  'thrillbilly mud club': 'sports-score', 'burger shot': 'restaurant',
  'bean machine': 'coffee', 'binco': 'checkroom',
  'lucky plucker': 'restaurant', 'hank\'s waffles': 'restaurant',
  'the rusty anchor': 'local-bar', 'hoodwinks bar': 'local-bar',
  'jack of hearts': 'nightlife', 'nine1nine': 'nightlife',
  'delights': 'nightlife', 'effluvia': 'nightlife',
  'vice vinyl': 'record', 'vinylism': 'record', 'flash fm': 'cell-tower',
  'bite house': 'restaurant', 'gellhorn roadhouse': 'restaurant',
  'peewees': 'restaurant', "billie bob's": 'restaurant',
  'game horde': 'gaming', 'the old mill': 'content-cut',
  'presidential bunker': 'fort', 'national coast guard': 'anchor',
  'whiz': 'smartphone', 'beacon': 'movie',
};

const nameRules = [
  [/\b(?:sign|billboard)\b/i, 'sign'],
  [/\bmurals?\b/i, 'gallery'],
  [/\blifeguard\b/i, 'lifeguard'],
  [/\bwater(?:fall|falls)\b/i, 'waterfall'],
  [/\bwater tower\b/i, 'water-tower'],
  [/\bwater tank\b/i, 'water'],
  [/\blighthouse\b/i, 'lighthouse'],
  [/\b(?:cell|radio|broadcast) tower\b|\bradio mast\b/i, 'cell-tower'],
  [/\bobservatory\b/i, 'observatory'],
  [/\bradar\b/i, 'radar'],
  [/\bcontrol tower\b/i, 'control-tower'],
  [/\b(?:bridge|footbridge|drawbridge)\b/i, 'suspension-bridge'],
  [/\btunnel\b/i, 'tunnel'],
  [/\bparking\b|\bcar park\b/i, 'local-parking'],
  [/\b(?:metro|metromover|train station|railway|railyard)\b|^tequesta station$/i, 'train'],
  [/\bprison\b|\bpenitentiary\b|\bjail\b/i, 'prison'],
  [/\bpolice\b|\bsheriff/i, 'local-police'],
  [/\bfire (?:station|rescue)\b/i, 'local-fire-department'],
  [/\bpharmacy\b|\bfarmacia\b/i, 'pharmacy'],
  [/\bhospital\b|\bclinic\b|\bmedical cent(?:er|re)\b/i, 'local-hospital'],
  [/\b(?:restrooms?|toilets?)\b/i, 'restrooms'],
  [/\btattoo\b/i, 'tattoo'],
  [/\bbarber\b|\bunisex salon\b/i, 'content-cut'],
  [/\b(?:bank|lombank|fleeca|hobbs milford)\b/i, 'account-balance'],
  [/\bammu.nation\b|\b(?:gun|guns)\b/i, 'pistol-gun'],
  [/\bpawn\b/i, 'storefront'],
  [/\b(?:jewelry|jewellery|joyeria)\b/i, 'diamond'],
  [/\b(?:casino|bingo)\b/i, 'casino'],
  [/\btennis\b/i, 'sports-tennis'],
  [/\bbasketball\b/i, 'sports-basketball'],
  [/\bvolleyball\b/i, 'volleyball'],
  [/\bsoccer\b/i, 'soccer'],
  [/\bbaseball\b/i, 'baseball'],
  [/\bgolf\b/i, 'sports-golf'],
  [/\b(?:stadium|arena|grandstands)\b/i, 'stadium'],
  [/\braceway\b|\bspeedway\b|\brace ?track\b/i, 'sports-score'],
  [/\bferris\b/i, 'ferris-wheel'],
  [/\b(?:gym|fitness)\b/i, 'gym'],
  [/\b(?:swimming|pool)\b/i, 'swimming'],
  [/\b(?:theater|theatre|ballet|opera|stage)\b/i, 'theater'],
  [/\b(?:cinema|movie screen)\b/i, 'movie'],
  [/\b(?:nightclub|cabaret|strip club|malibu club)\b/i, 'nightlife'],
  [/\b(?:bar|tavern|liquor)\b/i, 'local-bar'],
  [/\b(?:cafe|café|coffee)(?=\W|$)/i, 'coffee'],
  [/\b(?:restaurant|diner|seafood|deli|waffles|shrimp shack|bar & grill)\b/i, 'restaurant'],
  [/\baquarium\b|\boceanarium\b/i, 'aquarium'],
  [/\b(?:workshop|body shop)\b/i, 'car-repair'],
  [/\bcontainer crane\b/i, 'crane'],
  [/\b(?:marina|boatyard|shipyard|dock|docks|pier|berth|boat ramp|boat racks|hovercraft)\b/i, 'anchor'],
  [/\b(?:car wash)\b/i, 'local-car-wash'],
  [/\b(?:customs|auto parts|repair|tires|scrapyard|salvage)\b/i, 'car-repair'],
  [/\bdealership\b/i, 'directions-car'],
  [/\bgarage\b/i, 'garage'],
  [/\bgas (?:station|stop)\b/i, 'local-gas-station'],
  [/\b(?:bus stop|bus station|bus loop)\b/i, 'directions-bus'],
  [/\b(?:metro|metromover|train|railway|railyard)\b|^tequesta station$/i, 'train'],
  [/\bhelipad\b|\bhelicopter\b/i, 'helicopter'],
  [/\bhangars?\b/i, 'hangar'],
  [/\bblimp\b/i, 'blimp'],
  [/\b(?:airport|airfield|air station|runway|flight support)\b/i, 'flight'],
  [/\b(?:hotel|motel|inn|resort)\b/i, 'hotel'],
  [/\b(?:spa|nails)\b/i, 'spa'],
  [/\b(?:pet store)\b/i, 'pets'],
  [/\b(?:furniture|mattress)\b/i, 'furniture'],
  [/\bcopyshop\b/i, 'print'],
  [/\btools\b/i, 'tools'],
  [/\b(?:shopping plaza|minimall|mall)\b/i, 'storefront'],
  [/\b(?:visitor center)\b/i, 'info'],
  [/\b(?:community cent(?:er|re)|cultural center)\b/i, 'community'],
  [/\bresearch\b/i, 'research'],
  [/\bpiano\b/i, 'piano'],
  [/\blabyrinth\b/i, 'maze'],
  [/\bfountain\b/i, 'fountain'],
  [/\bunderwater ruins\b|\breefs\b/i, 'diving'],
  [/^dam$|^lock$/i, 'dam'],
  [/\bfracking\b|\baggregates\b/i, 'industry'],
  [/\bchurch\b/i, 'church'],
  [/\bschool\b/i, 'school'],
  [/\bmuseum\b/i, 'museum'],
  [/\bgallery\b/i, 'gallery'],
  [/\b(?:sculpture|monument|memorial|cemetery|graveyard)\b/i, 'monument'],
  [/\b(?:camp|campground|trailer park|rv park)\b/i, 'camp'],
  [/\b(?:postal|post office)\b/i, 'mail'],
  [/\b(?:guard booth|guardhouse|gate)\b/i, 'gate'],
  [/\b(?:warehouse|distribution|shipping terminal)\b/i, 'warehouse'],
  [/\b(?:factory|refinery|smokestack|sugar mill|silo|tank|sewage|waste transfer)\b/i, 'industry'],
  [/\b(?:power station|substation|transformer|electrical)\b/i, 'electrical-services'],
  [/\b(?:apartments?|apts|residences)\b/i, 'home'],
  [/\b(?:bank|tower|office|hq|financial center)\b/i, 'location-city'],
  [/\b(?:apartments?|apts|residences|house|cabins?|manor|estate)\b/i, 'home'],
  [/\b(?:lake|river|riverbank|canal|bay|ocean|gulf|straits|reservoir|cove|springs|breakwater)\b/i, 'water'],
  [/\b(?:mount|mountain|hills|canyon|cave|quarry)\b/i, 'mountain'],
  [/\b(?:forest|woods)\b/i, 'forest'],
  [/\b(?:park|beach|island|islands|peninsula|sandbars|key)\b/i, 'park'],
  [/\b(?:farm|ranch|sugar fields)\b/i, 'agriculture'],
  [/\b(?:clothing|fashions|footwear|shoes)\b/i, 'checkroom'],
  [/\b(?:market|supermarket|minimall|mall|store|shop|outlet)\b/i, 'storefront'],
  [/\b(?:road|street|intersection|interchange|roundabout|turn)\b/i, 'road'],
];

const tagSymbols = {
  '#gas': 'local-gas-station', '#jail': 'prison', '#police': 'local-police',
  '#hospital': 'local-hospital', '#pharmacy': 'pharmacy',
  '#nightclub': 'nightlife', '#stripclub': 'nightlife', '#bar': 'local-bar', '#drinks': 'local-bar',
  '#racetrack': 'sports-score', '#tennis': 'sports-tennis', '#golf': 'sports-golf',
  '#gym': 'gym', '#cinema': 'movie', '#ferriswheel': 'ferris-wheel', '#beach_volleyball': 'volleyball', '#volleyball': 'volleyball',
  '#marina': 'anchor', '#airport': 'flight', '#airbase': 'flight', '#bus': 'directions-bus',
  '#train': 'train', '#metro': 'train', '#metromover': 'train',
  '#food': 'restaurant', '#fastfood': 'restaurant', '#liquor': 'local-bar',
  '#clothes': 'checkroom', '#shoes': 'checkroom', '#guns': 'pistol-gun',
  '#carwash': 'local-car-wash', '#modshop': 'car-repair', "#pay'n'spray": 'car-repair',
  '#safehouse': 'home', '#supermarket': 'storefront', '#hair': 'content-cut',
  '#tattoos': 'tattoo', '#electronics': 'smartphone', '#blimp': 'blimp',
};

const categorySymbols = {
  'place-town': 'town', 'place-hotel': 'hotel', 'place-restaurant': 'restaurant',
  'place-retail': 'storefront', 'place-leisure': 'area', 'place-residential': 'home',
  'place-office': 'location-city', 'place-mixed': 'location-city', 'place-construction': 'construction',
  'place-industrial': 'industry', 'place-government': 'account-balance', 'place-public': 'account-balance',
  'place-transportation': 'road', 'place-utilities': 'electrical-services', 'place-agriculture': 'agriculture',
  'place-natural': 'park', 'place-airport': 'flight', 'place-marina': 'anchor', 'place-rail': 'train',
  'place-gas': 'local-gas-station', 'place-police': 'local-police', 'place-hospital': 'local-hospital',
  'place-repair': 'car-repair', 'place-landmark': 'area',
};

export function getNamedPlaceIconSymbol(label) {
  const name = label.replaceAll('?', '').replaceAll('’', "'").trim();
  return namedVenues[name.toLowerCase()] ?? nameRules.find(([pattern]) => pattern.test(name))?.[1];
}

export function getPlaceIconSymbol(record) {
  if (record.areaLabel || record.landmark.nameStatus === 'unknown') return 'area';
  if (record.category === 'place-town') return 'town';
  const named = getNamedPlaceIconSymbol(record.name);
  if (named) return named;
  for (const tag of record.landmark.tags) if (tagSymbols[tag]) return tagSymbols[tag];
  const supplied = record.iconPath?.match(/\/gta6\/([^/]+)\.svg$/)?.[1];
  // Camera and bus were broad source categories, not venue-specific evidence.
  if (supplied && !['photo-camera', 'directions-bus', 'question-mark'].includes(supplied)) return supplied;
  return categorySymbols[record.category] ?? 'area';
}

export const getPlaceSymbolPath = symbol => {
  if (!artwork[symbol]) throw new Error(`Missing place artwork: ${symbol}`);
  return artwork[symbol];
};
export const getPlaceIconPath = record => getPlaceSymbolPath(getPlaceIconSymbol(record));
