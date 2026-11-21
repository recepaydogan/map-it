/** Preserve the client-linked talent allocations while translating the build advice. */
export function localizePaladinTalentTable(original, labels) {
  const table = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  if (!table || !labels?.headers || labels.builds?.length !== 3 || labels.reasons?.length !== 3) {
    throw new Error("Paladin talent table or translations missing");
  }
  let row = 0;
  const result = table.replace(/<th>([^<]+)<\/th>/g, (_, english) => {
    if (!labels.headers[english]) throw new Error(`Missing Paladin talent header ${english}`);
    return `<th>${labels.headers[english]}</th>`;
  }).replace(/<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([^<]+)<\/td><\/tr>/g,
    (_, _build, talentsAt20, addedBy30) => {
      const build = labels.builds[row];
      const reason = labels.reasons[row];
      if (!build || !reason) throw new Error(`Missing Paladin talent row ${row}`);
      row += 1;
      return `<tr><td>${build}</td><td>${talentsAt20}</td><td>${addedBy30}</td><td>${reason}</td></tr>`;
    });
  if (row !== 3) throw new Error(`Expected 3 Paladin talent builds, found ${row}`);
  return result;
}
