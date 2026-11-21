export function splitItemEffects(description: string) {
  const blocks = description.split(/^[ \t]*\[(Owned Effect|Equipped Effect|Equip Effect)\][ \t]*$/m);
  let owned = "";
  let equipped = "";
  for (let index = 1; index < blocks.length; index += 2) {
    if (blocks[index] === "Owned Effect") owned = [owned, blocks[index + 1].trim()].filter(Boolean).join("\n");
    if (blocks[index] === "Equipped Effect" || blocks[index] === "Equip Effect") equipped = [equipped, blocks[index + 1].trim()].filter(Boolean).join("\n");
  }
  return { description: blocks[0].trim(), owned, equipped };
}
