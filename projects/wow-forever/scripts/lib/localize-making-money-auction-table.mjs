/** Use the installed client's own auction-house names and preserve its fee rows. */
export function localizeMakingMoneyAuctionTable(original, labels, source, locale, language) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels) throw new Error("Making-money auction table or labels missing");
  const names = new Map();
  source.keys.forEach((key, index) => {
    if (!key.startsWith("AuctionHouse:") || !key.endsWith(":0")) return;
    const english = source.values[index].replace(/\s+/g, " ").trim();
    if (!names.has(english)) names.set(english, locale.values[index]);
  });
  let rows = 0;
  const separator = language.startsWith("zh") ? "、" : ", ";
  const translated = table.replace(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>(\d+%)<\/td><td>(\d+%)<\/td><\/tr>/g,
    (_, houses, users, deposit, cut) => {
      rows += 1;
      if (!labels[users]) throw new Error(`Missing auction user label: ${users}`);
      const houseNames = houses.split(", ").map((english) => {
        const name = names.get(english);
        if (!name) throw new Error(`Missing client auction house: ${english}`);
        return name;
      }).join(separator);
      return `<tr><td>${houseNames}</td><td>${labels[users]}</td><td>${deposit}</td><td>${cut}</td></tr>`;
    });
  if (rows !== 3) throw new Error(`Expected three auction rows, found ${rows}`);
  return translated.replace(/<th>([^<]+)<\/th>/g, (_, value) => {
    if (!labels[value]) throw new Error(`Missing auction header: ${value}`);
    return `<th>${labels[value]}</th>`;
  });
}
