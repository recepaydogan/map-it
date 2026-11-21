// Calibrated against 61 same-name flight points in MapGenie and the client atlas.
// The maximum residual on the two main continents is under 0.1 atlas pixel.
const mainTransforms = {
  kalimdor: { xScale: 35445.09834031542, xOffset: 34626.4386556985,
    yScale: -35450.95282771131, yOffset: 36042.87093065838 },
  easternKingdoms: { xScale: 35595.9074071177, xOffset: 40912.46083541417,
    yScale: -35594.72093725052, yOffset: 36052.8385463313 },
};

// Zephras has a separate overview inset. An artwork fit yielded 642 inliers.
const zephrasImageTransform = {
  xx: 7.99920304, xy: 0.000453344881, xOffset: -1387.04846,
  yx: -0.000453344881, yy: 7.99920304, yOffset: -2270.58893,
};

export const projectMapgenieAtlas = (latitude, longitude) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Invalid MapGenie coordinates.");
  }
  const continent = longitude < -0.9 ? "zephras" : longitude < -0.6 ? "kalimdor" : "easternKingdoms";
  let point;
  if (continent === "zephras") {
    const radians = latitude * Math.PI / 180;
    const tileX = (longitude + 180) / 360 * 8192;
    const tileY = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * 8192;
    const pixelX = (tileX - 4073) * 256;
    const pixelY = (tileY - 4082) * 256;
    const { xx, xy, xOffset, yx, yy, yOffset } = zephrasImageTransform;
    point = { x: (xx * pixelX + xy * pixelY + xOffset) * 0.95,
      y: 17000 + (yx * pixelX + yy * pixelY + yOffset) * 0.95 };
  } else {
    const transform = mainTransforms[continent];
    point = { x: transform.xScale * longitude + transform.xOffset,
      y: transform.yScale * latitude + transform.yOffset };
  }
  if (point.x < 0 || point.x > 32768 || point.y < 0 || point.y > 21845) {
    throw new Error(`MapGenie coordinates project outside the atlas: ${latitude}, ${longitude}.`);
  }
  return { ...point, continent };
};
