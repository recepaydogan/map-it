"""Extract the MapGenie category glyphs used by the Azeroth map."""

from pathlib import Path
from urllib.request import urlopen
import re

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


BASE_URL = "https://mapgenie.io/game-icons/world-of-warcraft-forever/"
OUTPUT = Path(__file__).resolve().parents[1] / "public/maps/client-icons"
ICONS = {
    "auctioneer": "auctioneer",
    "banker": "banker",
    "barber-shop": "barber_shop",
    "graveyard": "graveyard",
    "innkeeper": "innkeeper",
    "dungeon": "instance",
    "mailbox": "mailbox",
    "profession-trainer": "profession_trainer",
    "repair-vendor": "repair_vendor",
    "stable-master": "stable_master",
    "transmogrifier": "transmogrifier",
    "merchant": "merchant",
    "repeatable-quest": "repeatable",
    "quest": "quest",
    "treasure": "treasure",
}


def main() -> None:
    css = urlopen(BASE_URL + "icons.css", timeout=30).read().decode()
    version = re.search(r"icons\.ttf\?v=(\d+)", css)
    if not version:
        raise ValueError("MapGenie font version is missing")
    font_bytes = urlopen(BASE_URL + f"icons.ttf?v={version.group(1)}", timeout=30).read()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font_path = OUTPUT / "mapgenie-icons.ttf"
    font_path.write_bytes(font_bytes)
    try:
        font = TTFont(font_path)
        glyphs = font.getGlyphSet()
        cmap = font.getBestCmap()
        for category, icon_name in ICONS.items():
            rule = re.search(
                rf'\.icon-{re.escape(icon_name)}:before\s*{{\s*content:\s*"\\([0-9a-f]+)";\s*color:\s*(#[0-9a-f]+)',
                css,
            )
            if not rule:
                raise ValueError(f"Missing MapGenie icon {icon_name}")
            glyph_name = cmap[int(rule.group(1), 16)]
            glyph = glyphs[glyph_name]
            bounds_pen = BoundsPen(glyphs)
            glyph.draw(bounds_pen)
            if bounds_pen.bounds is None:
                raise ValueError(f"Empty MapGenie icon {icon_name}")
            xmin, ymin, xmax, ymax = bounds_pen.bounds
            path_pen = SVGPathPen(glyphs)
            glyph.draw(path_pen)
            width, height = xmax - xmin, ymax - ymin
            side = max(width, height) * 1.18
            center_x, center_y = (xmin + xmax) / 2, -(ymin + ymax) / 2
            viewbox = f"{center_x - side / 2:.3f} {center_y - side / 2:.3f} {side:.3f} {side:.3f}"
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}">'
                f'<path fill="{rule.group(2)}" transform="scale(1,-1)" '
                f'd="{path_pen.getCommands()}"/></svg>\n'
            )
            (OUTPUT / f"mapgenie-{category}.svg").write_text(svg, encoding="utf-8")
    finally:
        font_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
