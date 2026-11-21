"""Snapshot wiki.gg DataMaps source, rendered marker panels, and map assets.

This writes research data only; it does not change the app map.
Run with: python scripts/extract-enshrouded-map.py
Requires: requests and beautifulsoup4.
"""

from __future__ import annotations

import hashlib
import html
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "research" / "enshrouded-wiki"
BASE = "https://enshrouded.wiki.gg"
API = f"{BASE}/api.php"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; EnshroudedContentResearch/1.0)"}
MAP_PAGES = ("Map:Embervale", "Map:Embervale/Lore", "Map:Embervale/Collectibles2")


def api(**params) -> dict:
    response = requests.get(API, params={"format": "json", "formatversion": 2, **params},
        headers=HEADERS, timeout=60)
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise RuntimeError(data["error"])
    return data


def source_pages() -> dict[str, dict]:
    results: dict[str, dict] = {}
    pending = list(MAP_PAGES)
    while pending:
        titles = sorted(set(pending) - results.keys())
        pending = []
        if not titles:
            break
        response = api(action="query", prop="revisions", rvslots="main", rvprop="content|ids|timestamp",
            titles="|".join(titles))
        for page in response["query"]["pages"]:
            if "missing" in page:
                raise RuntimeError(f"Missing map source page: {page['title']}")
            revision = page["revisions"][0]
            content = json.loads(revision["slots"]["main"]["content"])
            results[page["title"]] = {"pageId": page["pageid"], "revision": revision["revid"],
                "updatedAt": revision["timestamp"], "content": content}
            pending.extend(title for title in content.get("include", []) if title not in results)
    return results


def rendered_markers(page_id: str, revision: int) -> dict:
    merged: dict[str, list] = {}
    offset = 0
    while True:
        response = api(action="queryDataMap", pageid=page_id, revid=revision, limit=5000,
            **({"continue": offset} if offset else {}))
        query = response["query"]
        for layers, placements in query["markers"].items():
            merged.setdefault(layers, []).extend(placements)
        if "continue" not in query:
            return {"title": query["title"], "revision": query["revisionId"], "markers": merged}
        next_offset = int(query["continue"])
        if next_offset <= offset:
            raise RuntimeError("Map marker pagination did not advance")
        offset = next_offset


def plain_html(fragment: str) -> str:
    return BeautifulSoup(html.unescape(fragment), "html.parser").get_text(" ", strip=True)


def marker_records(sources: dict[str, dict], rendered: dict[str, dict]) -> list[dict]:
    originals: dict[str, dict] = {}
    for title, source in sources.items():
        for layers, placements in source["content"].get("markers", {}).items():
            for marker in placements:
                uid = marker.get("id")
                if not uid:
                    raise RuntimeError(f"Marker without ID in {title}/{layers}")
                if uid in originals:
                    raise RuntimeError(f"Duplicate source marker ID: {uid}")
                originals[uid] = {"sourceFragment": title, "layers": layers, **marker}

    displayed: dict[str, dict] = {}
    for title, map_data in rendered.items():
        for layers, placements in map_data["markers"].items():
            for placement in placements:
                y, x, panel = placement
                uid = panel["uid"]
                if uid not in originals:
                    raise RuntimeError(f"Rendered marker missing from source: {uid}")
                if (originals[uid]["x"], originals[uid]["y"]) != (x, y):
                    raise RuntimeError(f"Coordinate mismatch for {uid}")
                current = displayed.setdefault(uid, {"presentOn": [], "renderedLayers": layers, "panel": panel})
                current["presentOn"].append(title)
                # Main and Lore views can resolve redirects to different article targets.
                # Prefer the Main view, but still reject conflicting labels/text/images.
                if {k: v for k, v in current["panel"].items() if k != "article"} != {k: v for k, v in panel.items() if k != "article"}:
                    raise RuntimeError(f"Inconsistent rendered panel for {uid}")
    if set(originals) != set(displayed):
        raise RuntimeError(f"Map source/display mismatch: {len(set(originals) ^ set(displayed))} IDs")

    records = []
    for uid, source in originals.items():
        panel = displayed[uid]["panel"]
        image = panel.get("image")
        records.append({"id": uid, "x": source["x"], "y": source["y"],
            "layers": source["layers"], "sourceFragment": source["sourceFragment"],
            "presentOn": displayed[uid]["presentOn"],
            "name": html.unescape(panel.get("label", "")),
            "description": plain_html(panel.get("desc", "")),
            "descriptionHtml": panel.get("desc", ""),
            "article": panel.get("article"),
            "imageFile": source.get("image"),
            "panelImage": {"url": urljoin(BASE, image[0]), "width": image[4], "height": image[3]}
            if isinstance(image, list) and len(image) >= 5 else None,
            "source": source})
    return sorted(records, key=lambda record: record["id"])


def asset_urls(config: dict, markers: list[dict], building_images: dict) -> dict[str, list[dict]]:
    map_entry = next(item for item in config["maps"] if item["id"] == "5179")
    tiles = []
    for index, overlay in enumerate(map_entry["config"]["backgrounds"][0]["overlays"]):
        tiles.append({"url": urljoin(BASE, overlay["image"]), "bounds": overlay["at"],
            "name": overlay["image"].split("/")[-1].split("?")[0], "order": index})
    icons = []
    for map_item in config["maps"]:
        for group, settings in map_item["config"]["groups"].items():
            if settings.get("markerIcon"):
                icons.append({"url": urljoin(BASE, settings["markerIcon"]), "group": group})
    photos = [{"url": marker["panelImage"]["url"], "markerId": marker["id"]}
        for marker in markers if marker["panelImage"]]
    building = [{"url": data["url"], "file": name} for name, data in building_images.items() if data.get("url")]
    return {"tiles": tiles, "markerIcons": icons, "markerPhotos": photos, "buildingImages": building}


def asset_target(kind: str, url: str) -> Path:
    name = Path(urlparse(url).path).name
    if kind == "tiles":
        return OUTPUT / "assets" / "tiles" / name
    digest = hashlib.sha256(url.encode()).hexdigest()[:12]
    return OUTPUT / "assets" / kind / f"{digest}-{name}"


def download_asset(kind: str, url: str) -> dict:
    path = asset_target(kind, url)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 0:
        payload = path.read_bytes()
        content_type = "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    else:
        response = requests.get(url, headers=HEADERS, timeout=45)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";")[0]
        if not content_type.startswith("image/"):
            raise RuntimeError(f"Non-image response for {url}: {content_type}")
        payload = response.content
        if len(payload) < 100:
            raise RuntimeError(f"Suspiciously small image response for {url}")
        path.write_bytes(payload)
    return {"url": url, "path": path.relative_to(OUTPUT).as_posix(),
        "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(), "mime": content_type}


def download_assets(groups: dict[str, list[dict]]) -> dict:
    unique: dict[str, str] = {}
    for kind, assets in groups.items():
        for asset in assets:
            unique.setdefault(asset["url"], kind)
    manifest = {}
    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(download_asset, kind, url): url for url, kind in unique.items()}
        for job in as_completed(jobs):
            url = jobs[job]
            try:
                manifest[url] = job.result()
            except Exception as error:
                failures.append({"url": url, "error": str(error)})
    return {"files": manifest, "failures": failures}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = source_pages()
    config = json.loads((OUTPUT / "map-config.json").read_text(encoding="utf-8"))
    rendered = {title: rendered_markers(next(item for item in config["maps"] if item["config"]["version"]
        == sources[title]["revision"])["id"], sources[title]["revision"]) for title in MAP_PAGES}
    markers = marker_records(sources, rendered)
    if len(markers) != 1018:
        raise RuntimeError(f"Expected 1018 unique map markers, got {len(markers)}")
    building_images = json.loads((OUTPUT / "building-images.json").read_text(encoding="utf-8"))
    assets = asset_urls(config, markers, building_images)
    (OUTPUT / "map-source-pages.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "map-markers.json").write_text(json.dumps({"schemaVersion": 1,
        "capturedAt": datetime.now(timezone.utc).isoformat(), "markerCount": len(markers), "markers": markers},
        ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "asset-sources.json").write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Source fragments:", len(sources), "Map markers:", len(markers))
    print("Asset references:", {kind: len(items) for kind, items in assets.items()})
    manifest = download_assets(assets)
    (OUTPUT / "asset-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Downloaded unique assets:", len(manifest["files"]), "failures:", len(manifest["failures"]))
    for failure in manifest["failures"][:10]:
        print("Asset failure:", failure["url"], failure["error"])


if __name__ == "__main__":
    main()
