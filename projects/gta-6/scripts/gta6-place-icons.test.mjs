import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { getPlaceIconSymbol } from '../src/features/map/gta6-place-icons.mjs';
import { getSupplementalIconSymbol } from '../src/features/map/gta6-supplemental-icons.mjs';

const place = (name, extra = {}) => ({ name, category: 'place-landmark',
  iconPath: 'maps/category-icons/gta6/photo-camera.svg',
  landmark: { nameStatus: 'confirmed', tags: [] }, ...extra });

test('venue identity replaces broad camera, bus, healthcare and race icons', () => {
  for (const [name, expected] of [
    ['Dock Ring', 'ferris-wheel'], ['Vice City Casino Racetrack', 'sports-score'],
    ["Ricardo's Tires", 'car-repair'], ['RES TRADE PAINT', 'storefront'],
    ['The Atoll Bar & Grill', 'restaurant'], ['Tennis Courts', 'sports-tennis'],
    ['Fleeca Field', 'stadium'], ['Fleeca Field Metro Station', 'train'],
    ['Gellhorn International Raceway', 'sports-score'], ['Prison', 'prison'],
    ['Electric Fang Tattoo', 'tattoo'], ['Lake Leonida', 'water'],
    ['Vice City Oceanarium', 'aquarium'], ['Lifeguard Tower', 'lifeguard'],
    ["Brian's Boat Works & Marina", 'anchor'], ['Leaf Links Golf Club', 'sports-golf'],
    ['Hoodwinks Bar', 'local-bar'], ['Ajax Gym', 'gym'], ['Galina Ballet Opera House', 'theater'],
    ['Lombank', 'account-balance'], ['Factory', 'industry'], ['Warehouse', 'warehouse'],
    ['Public Restrooms', 'restrooms'], ['Radio Tower', 'cell-tower'],
    ['Water Tower', 'water-tower'], ['Arrow Gas Station', 'local-gas-station'],
  ]) assert.equal(getPlaceIconSymbol(place(name)), expected, name);
});

test('specific structures win over names of surrounding places', () => {
  for (const [name, expected] of [['Starlet Motel Sign','sign'], ['Bus Parking Lot','local-parking'],
    ['Train Bridge','suspension-bridge'], ['Train Tunnel','tunnel'], ['X Hotel Parking Lot','local-parking'],
    ['Beach Volleyball','volleyball'], ['Ambrosia Raceway Park','sports-score']]) {
    assert.equal(getPlaceIconSymbol(place(name)),expected,name);
  }
});

test('tags refine names without borrowing a real-world building identity', () => {
  assert.equal(getPlaceIconSymbol(place('The Vault', {landmark:{nameStatus:'confirmed',tags:['#nightclub']}})), 'nightlife');
  assert.equal(getPlaceIconSymbol(place('Unknown Venue', {landmark:{nameStatus:'confirmed',tags:[],realWorldAddress:'Bank, Miami'}})), 'area');
  assert.equal(getPlaceIconSymbol(place('Kelly County', {areaLabel:true})), 'area');
  assert.equal(getPlaceIconSymbol(place('Capri', {category:'place-town'})), 'town');
});

test('reviewed businesses and structures do not inherit misleading broad symbols', () => {
  for (const [name, expected] of [
    ['Bite House', 'restaurant'], ['Crossroad Park Minimall', 'storefront'],
    ['Golf Carts', 'sports-golf'], ['Footbridge', 'suspension-bridge'],
    ['Drawbridge', 'suspension-bridge'], ["Chip's Body Shop", 'car-repair'],
    ['Gellhorn Roadhouse', 'restaurant'], ['Gellhorn Roadhouse Sign', 'sign'],
    ['Pegassi Residences South Tower', 'home'], ['Café Coyote', 'coffee'],
    ['Pawn Shop', 'storefront'], ['Pawn & Gun', 'pistol-gun'],
    ['Container Crane', 'crane'], ['Blimp', 'blimp'], ['Dam', 'dam'],
    ['Grassrivers Visitor Center', 'info'], ['Underwater Research Station', 'research'],
    ['Ancient Labyrinth', 'maze'], ['Underwater Ruins', 'diving'],
    ['Nirvana Spa', 'spa'], ['Copyshop', 'print'], ['Game Horde', 'gaming'],
    ['Whiz', 'smartphone'], ['Beacon', 'movie'], ['Piano', 'piano'],
    ['Wet & Wild Pet Store', 'pets'], ['Mattress Madness', 'furniture'],
    ['Complete Tools', 'tools'], ['WLC Community Centre', 'community'],
  ]) assert.equal(getPlaceIconSymbol(place(name)), expected, name);
  assert.equal(getPlaceIconSymbol(place('Unnamed entertainment venue', {category:'place-leisure'})), 'area');
  assert.equal(getPlaceIconSymbol(place('The Old Mill', {landmark:{nameStatus:'confirmed', tags:['#hair']}})), 'content-cut');
});

test('every assigned icon is a packaged PNG', () => {
  const artwork=JSON.parse(fs.readFileSync('src/features/map/gta6-marker-artwork.json','utf8'));
  const {records}=JSON.parse(fs.readFileSync('public/data/gta6/landmarks.json','utf8'));
  for (const record of records) {
    const symbol = getSupplementalIconSymbol(record.landmark.id, record.name, record.category, record.landmark.sourceCategory);
    const iconPath = symbol ? artwork[symbol] : record.iconPath;
    assert(Object.values(artwork).includes(iconPath), `${record.name}: unregistered artwork`);
    assert(fs.existsSync('public/' + iconPath), `${record.name}: missing PNG`);
    if (symbol === 'sign') assert(/\b(?:sign|billboard|fingerpost)\b/i.test(record.name), record.name);
  }
});

test('landmarks, activities and vehicles use their own artwork instead of a generic sign', () => {
  for (const [id, name, category, expected] of [
    ['waink-landmark-020', "IAA's Friends of Freedom", 'place-landmark', 'monument'],
    ['waink-landmark-007', 'St. Lucia Lighthouse', 'place-landmark', 'lighthouse'],
    ['waink-landmark-011', 'Old Goliath', 'place-landmark', 'forest'],
    ['waink-curiosity-029', 'Desert Island Piano', 'place-landmark', 'piano'],
    ['waink-curiosity-014', 'Anti Sugar Residence', 'place-landmark', 'home'],
    ['waink-curiosity-033', 'Fingerpost', 'place-landmark', 'sign'],
    ['vehicle-spawn-001', 'Mammatus', 'place-vehicle', 'flight'],
    ['arcade-001', 'Arcade', 'place-leisure', 'gaming'],
    ['tattoo-001', 'Electric Fang', 'place-retail', 'tattoo'],
    ['ev-charger-001', 'Electric Vehicle Charger', 'place-amenity', 'electrical-services'],
    ['pool-001', 'Billiard Table', 'place-leisure', 'eight-ball'],
    ['car-meet-001', 'Car Meet', 'place-activity', 'directions-car'],
    ['helipad-001', 'Ambrosia Medical Center Helipad', 'place-airport', 'helicopter'],
    ['meditation-001', 'Swamp Meditation', 'place-activity', 'spa'],
    ['ahol-street-art-003', 'Ahol Street Art: Pallet', 'place-collectible', 'gallery'],
    ['random-event-064', 'Mudslider Mechanic', 'place-event', 'car-repair'],
  ]) assert.equal(getSupplementalIconSymbol(id, name, category), expected, name);
  assert.equal(getPlaceIconSymbol(place('Vice Beach Welcome Mural')), 'gallery');
});
