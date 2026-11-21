/** Present basic catalog wiki tables as readable prose without exposing markup. */
export function plainWikiTables(value: string): string {
  return value.replace(/\{\|([\s\S]*?)\|\}/g, (_, body: string) => {
    let headers: string[] = [];
    const rows: string[] = [];
    const cellText = (cell: string) => cell.trim().replace(/^\*\s*/, "").replace(/\s+\*\s+/g, ", ");
    for (const [index, chunk] of body.split("|-").entries()) {
      const caption = chunk.match(/\|\+\s*([^!]*)/);
      if (caption?.[1].trim()) rows.push(caption[1].trim());
      const start = chunk.indexOf("!");
      if (chunk.trim().startsWith("!") || (index === 0 && start >= 0)) {
        headers = chunk.slice(start + 1).split("!!").map(cellText);
      } else if (index > 0 && chunk.trim()) {
        const cells = chunk.replace(/^\s*\|/, "").split("||").map(cellText);
        rows.push(cells.map((cell, i) => `${headers[i] ? `${headers[i]}: ` : ""}${cell || "—"}`).join("; "));
      }
    }
    return rows.length ? rows.join(". ") + "." : "";
  });
}
