// Native SkillLine labels from the existing verified locale catalogs.
export type ProfessionType = "primary" | "secondary";

export const PROFESSION_IDENTITIES = [
  {
    "id": "alchemy",
    "type": "primary",
    "skillLineId": 171,
    "names": [
      "Alchemy",
      "Alchimie",
      "Alquimia",
      "연금술",
      "炼金术",
      "鍊金術"
    ]
  },
  {
    "id": "blacksmithing",
    "type": "primary",
    "skillLineId": 164,
    "names": [
      "Blacksmithing",
      "Schmiedekunst",
      "Herrería",
      "Forge",
      "대장기술",
      "Ferraria",
      "锻造",
      "鍛造"
    ]
  },
  {
    "id": "enchanting",
    "type": "primary",
    "skillLineId": 333,
    "names": [
      "Enchanting",
      "Verzauberkunst",
      "Encantamiento",
      "Enchantement",
      "마법부여",
      "Encantamento",
      "附魔"
    ]
  },
  {
    "id": "engineering",
    "type": "primary",
    "skillLineId": 202,
    "names": [
      "Engineering",
      "Ingenieurskunst",
      "Ingeniería",
      "Ingénierie",
      "기계공학",
      "Engenharia",
      "工程学",
      "工程學"
    ]
  },
  {
    "id": "herbalism",
    "type": "primary",
    "skillLineId": 182,
    "names": [
      "Herbalism",
      "Kräuterkunde",
      "Botánica",
      "Herboristería",
      "Herboristerie",
      "약초채집",
      "Herborismo",
      "草药学",
      "草藥學"
    ]
  },
  {
    "id": "leatherworking",
    "type": "primary",
    "skillLineId": 165,
    "names": [
      "Leatherworking",
      "Lederverarbeitung",
      "Peletería",
      "Travail du cuir",
      "가죽세공",
      "Couraria",
      "制皮",
      "製皮"
    ]
  },
  {
    "id": "mining",
    "type": "primary",
    "skillLineId": 186,
    "names": [
      "Mining",
      "Bergbau",
      "Minería",
      "Minage",
      "채광",
      "Mineração",
      "采矿",
      "採礦"
    ]
  },
  {
    "id": "skinning",
    "type": "primary",
    "skillLineId": 393,
    "names": [
      "Skinning",
      "Kürschnerei",
      "Desollar",
      "Desuello",
      "Dépeçage",
      "무두질",
      "Esfolamento",
      "剥皮",
      "剝皮"
    ]
  },
  {
    "id": "tailoring",
    "type": "primary",
    "skillLineId": 197,
    "names": [
      "Tailoring",
      "Schneiderei",
      "Costura",
      "Sastrería",
      "Couture",
      "재봉술",
      "Alfaiataria",
      "裁缝",
      "裁縫"
    ]
  },
  {
    "id": "cooking",
    "type": "secondary",
    "skillLineId": 185,
    "names": [
      "Cooking",
      "Kochkunst",
      "Cocina",
      "Cuisine",
      "요리",
      "Culinária",
      "烹饪",
      "烹飪"
    ]
  },
  {
    "id": "firstaid",
    "type": "secondary",
    "skillLineId": 129,
    "names": [
      "First Aid",
      "Erste Hilfe",
      "Primeros auxilios",
      "Secourisme",
      "응급치료",
      "Primeiros Socorros",
      "急救"
    ]
  },
  {
    "id": "fishing",
    "type": "secondary",
    "skillLineId": 356,
    "names": [
      "Fishing",
      "Angeln",
      "Pesca",
      "Pêche",
      "낚시",
      "钓鱼",
      "釣魚"
    ]
  }
] as const;

export const getProfessionType = (id: string): ProfessionType | null =>
  PROFESSION_IDENTITIES.find(profession => profession.id === id)?.type ?? null;
