// Class context matters: Protection and Restoration have different client skill lines.
const SKILLS: Record<string, Record<string, number>> = {
  warrior: { Arms: 26, Fury: 256, Protection: 257 },
  paladin: { Holy: 594, Protection: 267, Retribution: 184 },
  hunter: { "Beast Mastery": 50, Marksmanship: 163, Survival: 51 },
  rogue: { Assassination: 253, Combat: 38, Subtlety: 39 },
  priest: { Discipline: 613, Holy: 56, Shadow: 78, "Shadow Magic": 78 },
  shaman: { Elemental: 375, "Elemental Combat": 375, Enhancement: 373, Restoration: 374 },
  mage: { Arcane: 237, Fire: 8, Frost: 6 },
  warlock: { Affliction: 355, Demonology: 354, Destruction: 593 },
  druid: { Balance: 574, Feral: 134, "Feral Combat": 134, Restoration: 573 },
};

export function specializationKey(classId: string, name: string): string | undefined {
  const id = SKILLS[classId]?.[name];
  return id === undefined ? undefined : `SkillLine:${id}:0`;
}
