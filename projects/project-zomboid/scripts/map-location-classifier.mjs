const LOCATION_GROUPS = [
  {
    category: "medical",
    subtypes: [
      "AnimalShelter",
      "Hospital",
      "Medical",
      "Nursinghome",
      "Optometrist",
      "Pharmacy",
      "Sanatorium",
      "Vetrenarian",
    ],
  },
  {
    category: "police",
    subtypes: ["Detentioncenter", "Police", "PoliceBurnt", "Prison", "Security"],
  },
  { category: "fire", subtypes: ["Firestation"] },
  { category: "fuel", subtypes: ["Gas", "GasBurnt", "Zippee"] },
  {
    category: "vehicle",
    subtypes: [
      "Cardealership",
      "Carsupplystore",
      "Mechanic",
      "ScrapyardGarage",
      "TaxiGarage",
      "Truck",
    ],
  },
  {
    category: "supplies",
    subtypes: [
      "Clothesstore",
      "ConvenienceStoreBurnt",
      "Cornerstore",
      "Departmentstore",
      "FarmingShop",
      "Farmstore",
      "Fishbait",
      "Furniturestore",
      "Gardenstore",
      "Generalstore",
      "Grocery",
      "Liquorstore",
      "Mall",
      "Tobaccostore",
    ],
  },
  {
    category: "food",
    subtypes: [
      "Bakery",
      "BarStone",
      "BarWood",
      "Coffeeshop",
      "CountryclubSnackbar",
      "Diner",
      "PizaawhirledBurnt",
      "Pizzawhirled",
      "Restaurant",
    ],
  },
  {
    category: "industrial",
    subtypes: [
      "Brewery",
      "Distillery",
      "Factory",
      "FarmStorage",
      "Freight",
      "Hayshipping",
      "IndustrialWarehouse",
      "Refinery",
      "Slaughterhouse",
      "Trainyard",
      "Transportcompany",
      "Warehousestorage",
      "WaterpurificationMainBuilding",
      "Weldingshop",
    ],
  },
  {
    category: "community",
    subtypes: [
      "Arena07Offices",
      "Bank",
      "Boatclub",
      "Bookstore",
      "Church",
      "ChurchAbandoned",
      "CommunityCentre",
      "ConventionHall",
      "Funeralhome",
      "Gallery",
      "Government",
      "Library",
      "LibraryBurnt",
      "Office",
      "Offices",
      "Post",
      "Radiostation",
      "Reccenter",
      "School",
      "SchoolColege",
      "Theatre",
      "Trainstation",
      "TrainstationAbadoned",
      "Tvstudio",
    ],
  },
  {
    category: "lodging",
    subtypes: [
      "Bedandbreakfast",
      "Cabin",
      "CabinAbandoned",
      "Hotel",
      "IndustryDorm",
      "Motel",
      "Resort",
      "ResortCabin",
      "SchoolDorms",
      "Shelter",
      "Summercamp",
    ],
  },
  {
    category: "military",
    subtypes: [
      "MilitaryApartments",
      "MilitaryBorder",
      "MilitaryCommunications",
      "MilitaryHouse",
      "MilitaryTent",
      "MilitaryTower",
      "MilitaryTownhouse",
      "MilitaryTrailer",
    ],
  },
  {
    category: "weapons",
    subtypes: [
      "Gunclub",
      "Pawnshop",
      "Shootingrange",
      "ShopCamping",
      "ShopHunting",
      "Sportstore",
      "Toolstore",
    ],
  },
];

const DISPLAY_NAMES = {
  AnimalShelter: "Animal Shelter",
  BarStone: "Stone Bar",
  BarWood: "Wooden Bar",
  Bedandbreakfast: "Bed and Breakfast",
  Cardealership: "Car Dealership",
  Carsupplystore: "Car Supply Store",
  Coffeeshop: "Coffee Shop",
  CommunityCentre: "Community Center",
  Cornerstore: "Corner Store",
  Departmentstore: "Department Store",
  Detentioncenter: "Detention Center",
  FarmingShop: "Farming Shop",
  FarmStorage: "Farm Storage",
  Farmstore: "Farm Store",
  Firestation: "Fire Station",
  Fishbait: "Fishing Supply Store",
  Furniturestore: "Furniture Store",
  Gardenstore: "Garden Store",
  Generalstore: "General Store",
  Gunclub: "Gun Club",
  Hayshipping: "Hay Shipping Depot",
  IndustrialWarehouse: "Industrial Warehouse",
  IndustryDorm: "Industrial Dormitory",
  Liquorstore: "Liquor Store",
  Nursinghome: "Nursing Home",
  PizaawhirledBurnt: "Burned Pizza Whirled",
  Pizzawhirled: "Pizza Whirled",
  PoliceBurnt: "Burned Police Station",
  Reccenter: "Recreation Center",
  ResortCabin: "Resort Cabin",
  SchoolColege: "College",
  SchoolDorms: "School Dormitory",
  ScrapyardGarage: "Scrapyard Garage",
  Shootingrange: "Shooting Range",
  ShopCamping: "Camping Store",
  ShopHunting: "Hunting Store",
  Slaughterhouse: "Slaughterhouse",
  Sportstore: "Sporting Goods Store",
  Summercamp: "Summer Camp",
  TaxiGarage: "Taxi Garage",
  Tobaccostore: "Tobacco Store",
  Toolstore: "Tool Store",
  Trainstation: "Train Station",
  TrainstationAbadoned: "Abandoned Train Station",
  Trainyard: "Train Yard",
  Transportcompany: "Transport Company",
  Tvstudio: "TV Studio",
  Vetrenarian: "Veterinarian",
  Warehousestorage: "Warehouse Storage",
  WaterpurificationMainBuilding: "Water Treatment Plant",
  Weldingshop: "Welding Shop",
  Zippee: "Zippee Market",
};

const LOCATION_INDEX = new Map(
  LOCATION_GROUPS.flatMap(({ category, subtypes }) =>
    subtypes.map((subtype) => [subtype.toLowerCase(), category]),
  ),
);

export const humanizeMapSubtype = (subtype) =>
  DISPLAY_NAMES[subtype] ??
  subtype
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

export const classifyMapLocation = (subtype) => {
  const normalizedSubtype = subtype.trim();
  const category = LOCATION_INDEX.get(normalizedSubtype.toLowerCase());
  if (!category) return undefined;
  return {
    category,
    label: humanizeMapSubtype(normalizedSubtype),
  };
};

const APARTMENT_SUBTYPES = /^(?:ApartmentBuilding|MilitaryApartments|Singleapartment)/i;
const HOUSE_SUBTYPES = /^(?:BrownbrickTownhouse|Farmhouse|Farmhousing|House|Lakehouse|Mansion|MilitaryHouse|MilitaryTownhouse|RedbrickTownhouse|Townhouse)/i;
const RESIDENTIAL_SUBTYPES = /^(?:Trailer)/i;
const AGRICULTURE_SUBTYPES = /^(?:Barn|Cattle|FarmStorage|Greenhouse|Horseriding|Ranch|Stables)/i;
const STORAGE_SUBTYPES = /^(?:Boathouse|Garage|Garagestorage|Hanger|Shed|Traincar|Warehouse)/i;
const COMMERCIAL_SUBTYPES = /^(?:Bargnclothes|Cleaningservices|Fitnesscenter|Hairdresser|Kicthenshowroom|Laundromat|Movierental|Musicstore|Paintshop|Plaza|Spa|StoreAbandoned|Storefront|Taxi|Weddingstore)/i;

const inferBuildingCategoryFromRooms = (roomTypes) => {
  const rooms = new Set(roomTypes.map((room) => room.toLowerCase()));
  if (["bedroom", "kitchen", "livingroom", "kidsbedroom"].some((room) => rooms.has(room))) {
    return "residential";
  }
  if ([...rooms].some((room) => /barn|farm|stable|animal|greenhouse/.test(room))) return "agriculture";
  if ([...rooms].some((room) => /garage|shed|storage|warehouse/.test(room))) return "storage";
  return "other";
};

export const classifyMapBuilding = (subtype, roomTypes = []) => {
  const normalizedSubtype = subtype?.trim() ?? "";
  if (APARTMENT_SUBTYPES.test(normalizedSubtype)) {
    return { category: "apartments", label: humanizeMapSubtype(normalizedSubtype) };
  }
  if (HOUSE_SUBTYPES.test(normalizedSubtype)) {
    return { category: "houses", label: humanizeMapSubtype(normalizedSubtype) };
  }
  const classifiedLocation = normalizedSubtype ? classifyMapLocation(normalizedSubtype) : undefined;
  if (classifiedLocation) return classifiedLocation;
  let category;
  if (RESIDENTIAL_SUBTYPES.test(normalizedSubtype)) category = "residential";
  else if (AGRICULTURE_SUBTYPES.test(normalizedSubtype)) category = "agriculture";
  else if (STORAGE_SUBTYPES.test(normalizedSubtype)) category = "storage";
  else if (COMMERCIAL_SUBTYPES.test(normalizedSubtype)) category = "commercial";
  else category = inferBuildingCategoryFromRooms(roomTypes);
  const label = normalizedSubtype
    ? humanizeMapSubtype(normalizedSubtype)
    : category === "houses"
      ? "House"
      : category === "apartments"
        ? "Apartment Building"
        : category === "residential"
      ? "Residence"
      : category === "storage"
        ? "Storage Building"
        : category === "agriculture"
          ? "Agricultural Building"
          : "Building";
  return { category, label };
};
