const upgradeFields = new Set([
  "AccessoryLevelDatas", "HighCycleAccessoryLevelDatas", "WeaponUpLevelDatas", "WeaponSnapSoulData",
  "ShaChiWeaponUpLevelData", "ShaChiWeaponSnapSoulData", "MedicineLevelData",
]);

export const isNativeUpgradeSection = (section: { label: string }): boolean => upgradeFields.has(section.label);
