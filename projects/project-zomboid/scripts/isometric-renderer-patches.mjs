import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RENDERER_PATCH_VERSION = "signed-map-cells-v1";

export const patchRendererMapCoordinates = (rendererRoot) => {
  for (const file of ["lotheader.py", "source_manager.py"]) {
    const path = join(rendererRoot, "pzmap2dzi", file);
    const source = readFileSync(path, "utf8");
    let matched = 0;
    const patched = source.split("\n").map((line) => {
      if (!line.includes("re.compile") || !/lotheader|lotpack/.test(line)) return line;
      matched += 1;
      return line.replace(/\((\\{1,2}d\+)\)/g, "(-?$1)");
    }).join("\n");
    if (matched !== (file === "lotheader.py" ? 1 : 2)) {
      throw new Error(`Renderer map coordinate patterns changed in ${path}.`);
    }
    if (patched !== source) writeFileSync(path, patched);
  }
};
