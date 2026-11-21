from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import cv2
import numpy as np
from PIL import Image


root = Path(__file__).resolve().parents[1]
tile_size = 256
map_x0, map_y0 = 4073, 4082
map_image = Image.new("RGB", (5 * tile_size, 4 * tile_size))
for y in range(4):
    for x in range(5):
        url = ("https://tiles.mapgenie.io/games/world-of-warcraft-forever/"
               f"azeroth/azeroth2/13/{map_y0 + y}/{map_x0 + x}.jpg")
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            tile = Image.open(BytesIO(urlopen(request).read())).convert("RGB")
            map_image.paste(tile, (x * tile_size, y * tile_size))
        except HTTPError as error:
            if error.code != 403:
                raise

source = Image.new("RGB", (9 * 512, 8 * 512))
for y in range(8):
    for x in range(9):
        path = root / "public/maps/wdt-7198644/tiles/0" / f"tile{x}x{y}.webp"
        if path.exists():
            source.paste(Image.open(path).convert("RGB"), (x * 512, y * 512))

sift = cv2.SIFT_create(nfeatures=20000)
image_a = cv2.cvtColor(np.array(map_image), cv2.COLOR_RGB2GRAY)
image_b = cv2.cvtColor(np.array(source), cv2.COLOR_RGB2GRAY)
keys_a, desc_a = sift.detectAndCompute(image_a, None)
keys_b, desc_b = sift.detectAndCompute(image_b, None)
matches = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=100)).knnMatch(desc_a, desc_b, k=2)
good = [first for first, second in matches if first.distance < 0.7 * second.distance]
print("features", len(keys_a), len(keys_b), "matched", len(good))
if len(good) >= 4:
    from_points = np.float32([keys_a[match.queryIdx].pt for match in good])
    to_points = np.float32([keys_b[match.trainIdx].pt for match in good])
    transform, inliers = cv2.estimateAffinePartial2D(from_points, to_points,
                                                       method=cv2.RANSAC, ransacReprojThreshold=10)
    print("transform", transform)
    print("inliers", int(inliers.sum()))
