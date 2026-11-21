export interface MarkerDrawCommand {
  id: string;
  spriteKey: string;
  x: number;
  y: number;
  size: number;
  completed: boolean;
  raiseOnSelect?: boolean;
}

/** Keep selection independent from the camera's raster surface. Restore only
 * the old/new selection rectangles, in original stacking order, then raise the
 * selected sprite. Clip to backing-pixel boundaries to retain alpha parity. */
export function createMarkerPainter(
  context: CanvasRenderingContext2D,
  commands: MarkerDrawCommand[],
  sprites: Map<string, HTMLCanvasElement>,
  width: number,
  height: number,
  pixelRatio: number,
) {
  const byId = new Map(commands.map(command => [command.id, command]));
  const indexById = new Map(commands.map((command, index) => [command.id, index]));
  const cellSize = 128;
  const bounds = commands.map(command => {
    const padding = command.completed ? 3 : 1;
    return {
      left: Math.floor((command.x - padding) * pixelRatio) / pixelRatio,
      top: Math.floor((command.y - padding) * pixelRatio) / pixelRatio,
      right: Math.ceil((command.x + command.size + padding) * pixelRatio) / pixelRatio,
      bottom: Math.ceil((command.y + command.size + padding) * pixelRatio) / pixelRatio,
    };
  });
  const boundsById = new Map(commands.map((command, index) => [command.id, bounds[index]!]));
  const cells = new Map<string, number[]>();
  const visitCells = (box: typeof bounds[number], visit: (key: string) => void) => {
    for (let x = Math.floor(box.left / cellSize); x <= Math.floor(box.right / cellSize); x++) {
      for (let y = Math.floor(box.top / cellSize); y <= Math.floor(box.bottom / cellSize); y++) visit(`${x}:${y}`);
    }
  };
  bounds.forEach((box, index) => visitCells(box, key => {
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
  }));
  const needsPatch = (id: string) => {
    if (byId.get(id)?.raiseOnSelect === false) return false;
    const index = indexById.get(id);
    if (index === undefined) return false;
    const box = bounds[index]!;
    let overlaps = false;
    visitCells(box, key => {
      for (const otherIndex of cells.get(key) ?? []) {
        if (otherIndex <= index) continue;
        const other = bounds[otherIndex]!;
        if (other.left <= box.right && other.right >= box.left
          && other.top <= box.bottom && other.bottom >= box.top) { overlaps = true; break; }
      }
    });
    return overlaps;
  };
  let painted = false;
  let previousId: string | null = null;

  const draw = (command: MarkerDrawCommand) => {
    const sprite = sprites.get(command.spriteKey);
    if (!sprite) return;
    const { x, y, size } = command;
    context.drawImage(sprite, x, y, size, size);
    if (!command.completed) return;
    const badgeX = x + size * 5 / 6;
    const badgeY = y + size * 5 / 6;
    const badgeRadius = size / 6;
    context.beginPath();
    context.arc(badgeX, badgeY, badgeRadius + 2, 0, Math.PI * 2);
    context.fillStyle = "#0b0b0e";
    context.fill();
    context.beginPath();
    context.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    context.fillStyle = "#34d399";
    context.fill();
    context.beginPath();
    context.moveTo(badgeX - badgeRadius / 2, badgeY);
    context.lineTo(badgeX - badgeRadius / 6, badgeY + badgeRadius / 3);
    context.lineTo(badgeX + badgeRadius / 2, badgeY - badgeRadius / 3);
    context.strokeStyle = "#0b0b0e";
    context.lineWidth = Math.max(1, badgeRadius / 3);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  };

  return (selectedId: string | null, force = false) => {
    const full = !painted || force;
    if (!full && previousId === selectedId) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingQuality = "high";
    context.save();
    let candidates = commands;
    if (full) context.clearRect(0, 0, width, height);
    else {
      const dirty = [previousId, selectedId].flatMap(id => {
        const box = id && needsPatch(id) ? boundsById.get(id) : undefined;
        return box ? [box] : [];
      });
      context.beginPath();
      for (const box of dirty) context.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      context.clip();
      const indices = new Set<number>();
      for (const box of dirty) {
        context.clearRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
        visitCells(box, key => {
          for (const index of cells.get(key) ?? []) {
            const other = bounds[index]!;
            if (other.left <= box.right && other.right >= box.left
              && other.top <= box.bottom && other.bottom >= box.top) indices.add(index);
          }
        });
      }
      candidates = [...indices].sort((a, b) => a - b).map(index => commands[index]!);
    }
    const selected = selectedId ? byId.get(selectedId) : undefined;
    const raised = selected?.raiseOnSelect === false ? undefined : selected;
    for (const command of candidates) if (command !== raised) draw(command);
    if (raised && (full || candidates.includes(raised))) draw(raised);
    context.restore();
    painted = true;
    previousId = selectedId;
  };
}
