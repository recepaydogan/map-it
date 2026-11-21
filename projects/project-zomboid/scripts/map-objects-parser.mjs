export const parseMapObjects = (source) => {
  const objects = [];
  const objectPattern = /\{\s*name\s*=\s*"([^"]*)"\s*,\s*type\s*=\s*"([^"]+)"\s*,\s*x\s*=\s*(-?\d+)\s*,\s*y\s*=\s*(-?\d+)\s*,\s*z\s*=\s*(-?\d+)\s*,\s*width\s*=\s*(\d+)\s*,\s*height\s*=\s*(\d+)/g;
  let match;

  while ((match = objectPattern.exec(source)) !== null) {
    objects.push({
      name: match[1],
      type: match[2],
      geometry: "rectangle",
      x: Number(match[3]),
      y: Number(match[4]),
      z: Number(match[5]),
      width: Number(match[6]),
      height: Number(match[7]),
    });
  }

  const polygonPattern = /\{\s*name\s*=\s*"([^"]*)"\s*,\s*type\s*=\s*"([^"]+)"\s*,\s*z\s*=\s*(-?\d+)\s*,\s*geometry\s*=\s*"polygon"\s*,\s*points\s*=\s*\{([^}]+)\}/g;
  while ((match = polygonPattern.exec(source)) !== null) {
    const points = match[4].split(",").map((value) => Number(value.trim())).filter(Number.isFinite);
    if (points.length < 6 || points.length % 2 !== 0) continue;
    objects.push({
      name: match[1],
      type: match[2],
      geometry: "polygon",
      z: Number(match[3]),
      points,
    });
  }

  return objects;
};
