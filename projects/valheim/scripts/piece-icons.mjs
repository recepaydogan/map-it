// Shared by building and crafting catalogs so each prefab has the same icon.
export function createPieceIconResolver(iconManifest) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const pieceIconsByStem = new Map()
  for (const [assetPath, icon] of Object.entries(iconManifest.icons ?? {})) {
    if (!assetPath.includes('/Pieces/icons/')) continue
    const stem = assetPath.slice(assetPath.lastIndexOf('/') + 1).replace(/\.png$/i, '')
    pieceIconsByStem.set(normalize(stem), icon.url)
  }
  const ICON_OVERRIDES = {
    wood_beam: 'wood_beam2',
    wood_beam_1: 'wood_beam1',
    woodwall: 'wood_wall',
    wood_pole_log: 'wood_logpole2',
    wood_pole_log_4: 'wood_logpole4',
    wood_wall_log: 'wood_logwall',
    'wood_wall_log_4x0.5': 'wood_logwall_4x05',
    blackmarble_2x2x2: 'blackmarble_2x2',
    blackmarble_column_1: 'blackmarble_column_small',
    blackmarble_column_2: 'blackmarble_column_wide',
    blackmarble_base_1: 'blackmarble_plinth',
    blackmarble_basecorner: 'blackmarble_plinth_corner',
    blackmarble_out_1: 'blackmarble_cornice',
    blackmarble_outcorner: 'blackmarble_cornice_corner',
    blackmarble_floor_triangle: 'blackmarble_triangle_floor',
    darkwood_roof_top: 'darkwood_roof_top_26',
    darkwood_roof_icorner: 'darkwood_roof_icorner_26',
    darkwood_roof_ocorner: 'darkwood_roof_ocorner_26',
    wood_wall_roof_top: 'wood_wall_roof_cross',
    wood_wall_roof_top_45: 'wood_wall_roof_cross_45',
    iron_floor_1x1_v2: 'iron_floor_1x1',
    Piece_grausten_pillarbase_tapered_inverted: 'grausten_pillar_tapered_inv',
    Piece_grausten_stone_ladder: 'grausten_ladder',
    ashwood_floor_2x2: 'ashwood_floor',
    ashwood_arch_big: 'ashwood_arch',
    crystal_wall_1x1: 'crystal_wall',
    wood_stepladder: 'wood_ladder',
    piece_dvergr_metal_wall_2x2: 'piece_dvergr_metall_wall_2x2',
    piece_chair: 'chair',
    piece_chair03: 'chair03',
    piece_throne02: 'throne02',
    piece_bone_throne: 'throne_bone',
    piece_blackmarble_throne: 'throne_blackmarble',
    piece_blackmarble_bench: 'bench_blackmarble',
    piece_blackmarble_table: 'table_blackmarble',
    piece_blackwood_bench01: 'benchashwood',
    piece_walltorch: 'walltorch',
    piece_groundtorch_mist: 'groundtorch_mist',
    piece_xmastree: 'xmastree',
    piece_gift1: 'gift1',
    piece_gift2: 'gift2',
    piece_gift3: 'gift3',
    piece_CelebrationGarland: 'garlandcelebration',
    piece_FairylightGarland: 'garlandfairylight',
    piece_bathtub: 'bath',
    piece_barber: 'barberstation',
    piece_chest: 'chest_wood',
    piece_chest_barrel: 'barrel',
    piece_magetable_ext: 'magetable_ext1',
    charcoal_kiln: 'coal_kiln',
    eitrrefinery: 'refinery',
    artisan_ext1: 'artisanextension',
    cauldron_ext1_spice: 'spicerack',
    cauldron_ext3_butchertable: 'butchertable',
    cauldron_ext4_pots: 'potsnpans',
    cauldron_ext5_mortarandpestle: 'mortarandpestle',
    cauldron_ext6_rollingpins: 'rollingpins',
    VikingShip: 'longship',
    VikingShip_Ashlands: 'longship_ashlands',
  }
  const pieceIcon = (prefabName, nameKey) => {
    const candidates = [
      ICON_OVERRIDES[prefabName],
      prefabName,
      prefabName.replace(/^Piece_/, ''),
      (nameKey ?? '').replace(/^\$piece_/, ''),
    ].filter(Boolean)
    for (const candidate of candidates) {
      const url = pieceIconsByStem.get(normalize(candidate))
      if (url) return url
    }
    return null
  }
  
  const iconByPathId = new Map(Object.values(iconManifest.icons ?? {}).filter((icon) => icon.pathId).map((icon) => [icon.pathId, icon.url]))

  return (prefabName, piece) => iconByPathId.get(piece?.icon?.pathId) ?? pieceIcon(prefabName, piece?.name)
}
