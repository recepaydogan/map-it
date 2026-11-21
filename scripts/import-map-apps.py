"""Read-only source imports; isolated runnable releases live under public/apps/."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import sys
import zipfile
import argparse
import uuid
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "config/map-apps.json").read_text(encoding="utf-8"))
SOURCE_ROOT = ROOT.parent
SKIP = {"node_modules", ".git", "bin", "obj", "__pycache__", "artifacts", "mining", "research", "store-screenshots"}
TEXT = {".html", ".js", ".css", ".json", ".svg"}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def safe_files(directory, source_artifacts=True):
    for current, dirs, files in os.walk(directory, followlinks=False):
        dirs[:] = [name for name in dirs if (not source_artifacts or name not in SKIP) and not (Path(current) / name).is_junction()
                   and not (Path(current) / name).is_symlink()]
        for name in files:
            path = Path(current) / name
            if not path.is_symlink():
                yield path


def source_snapshot(source, target=None):
    paths = []
    for name in ["src", "scripts", "native", "bridge-mod", "config", "schema", "supabase", "build"]:
        directory = source / name
        if not directory.is_dir():
            continue
        for path in safe_files(directory):
            if path.suffix.lower() in {".dll", ".exe", ".pdb", ".zip", ".opk", ".log", ".pyc"}:
                continue
            paths.append(path)
    for path in source.iterdir():
        if path.is_file() and (path.name in {"package.json", "package-lock.json", "AGENTS.md", "README.md", ".gitignore", ".env.example", "content-release.json"}
                               or path.suffix in {".ts", ".js", ".html"} or path.name.startswith("tsconfig")):
            paths.append(path)
    def copy_and_hash(file):
        relative = file.relative_to(source)
        if target:
            output = target / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(file, output)
        return relative.as_posix(), file_hash(file)
    with ThreadPoolExecutor(max_workers=8) as pool:
        return dict(pool.map(copy_and_hash, paths))


def release_candidates(source, version):
    archives = list(source.glob("*.opk")) + list((source / "releases").glob("*.opk"))
    archives = [p for p in archives if re.search(rf"(?:-|^){re.escape(version)}(?:-en)?\.opk$", p.name)
                and not p.name.endswith("-en.opk")]
    candidates = []
    for archive in archives:
        with zipfile.ZipFile(archive) as zipped:
            manifest = json.loads(zipped.read("manifest.json").decode("utf-8-sig"))
            if manifest["meta"]["version"] != version:
                raise RuntimeError(f"Release filename/manifest version mismatch: {archive}")
        candidates.append((archive.stat().st_mtime, archive))
    for folder in [".release-dist", "dist"]:
        directory = source / folder
        if not (directory / "manifest.json").is_file():
            continue
        if read_json(directory / "manifest.json")["meta"]["version"] != version:
            continue
        manifest = read_json(directory / "manifest.json")
        entries = [directory / window["file"] for window in manifest["data"]["windows"].values()]
        if not entries or not all(file.is_file() for file in entries):
            continue
        # Entry HTML is written by the build. A touched old asset must never
        # make an old directory look newer than a complete package.
        candidates.append((min(file.stat().st_mtime for file in entries), directory))
    return sorted(candidates, key=lambda item: (item[0], item[1].suffix == ".opk"), reverse=True)


def read_release(source, version, selected=None):
    candidates = release_candidates(source, version)
    if not candidates:
        raise RuntimeError(f"No current runnable release found for {source.name} {version}")
    selected = Path(selected) if selected else candidates[0][1]
    if selected.suffix == ".opk":
        with zipfile.ZipFile(selected) as zipped:
            names = [item.filename for item in zipped.infolist() if not item.is_dir()]
            if len(names) != len(set(names)):
                raise RuntimeError(f"Duplicate archive entries: {selected}")
            files = {name: zipped.read(name) for name in names}
    else:
        directory = selected
        files = {path.relative_to(directory).as_posix(): path.read_bytes() for path in safe_files(directory, source_artifacts=False)}
        # Normal development outputs retain old hashed bundles. Follow only the
        # current HTML's dependency graph when importing a development output.
        if directory.name == "dist":
            assets = {Path(name).name: name for name in files if name.startswith("assets/")}
            active = set()
            pending = [name for name in files if name.endswith(".html")]
            while pending:
                name = pending.pop()
                if name in active:
                    continue
                active.add(name)
                if Path(name).suffix in TEXT:
                    text = files[name].decode("utf-8-sig", errors="replace")
                    for token in re.findall(r"[\w@.-]+\.(?:js|css|woff2?|png|svg|webp|jpg|wasm)", text):
                        if token in assets and assets[token] not in active:
                            pending.append(assets[token])
            files = {name: body for name, body in files.items() if not name.startswith("assets/") or name in active}
            if source.name == "enshrouded-map":
                # This production build already embeds its immutable CDN URL.
                assert b"enshrouded.ingredientassets.com/releases/" in b"".join(
                    body for name, body in files.items() if name.endswith(".js"))
                files = {name: body for name, body in files.items() if not name.startswith(("maps/", "data/"))}
    for name in files:
        parts = Path(name).parts
        if ".." in parts or Path(name).is_absolute() or "\\" in name or ":" in name:
            raise ValueError(f"Unsafe release path: {name}")
        if any(part == "node_modules" or part == ".git" or part.startswith(".env") for part in parts):
            raise ValueError(f"Private/build input in release: {name}")
    return files, str(selected)


def map_hotkeys(app, native_hotkeys, host_hotkeys, shortcut_slots):
    """Route legacy names by window role before sharing host shortcuts."""
    mapping = {}
    aliases = app.get("hotkeyAliases", {})
    defaults = app.get("hotkeyDefaults", {})
    for name, hotkey in native_hotkeys.items():
        target = aliases.get(name, name)
        binding = defaults.get(name, hotkey.get("default"))
        if name in aliases and target not in host_hotkeys:
            raise ValueError(f"Unknown host hotkey for {app['id']}: {target}")
        slot = target if target in host_hotkeys else shortcut_slots.get(binding)
        if not slot:
            slot = f"mi_{app['id']}_{name}"
            host_hotkeys[slot] = {**hotkey, "title": f"{app['name']}: {hotkey['title']}"}
            if binding:
                host_hotkeys[slot]["default"] = binding
                shortcut_slots[binding] = slot
        mapping[name] = slot
    return mapping


def main(decisions=None):
    registry = []
    imports = []
    manifest = read_json(ROOT / "public/manifest.json")
    manifest["data"]["windows"] = {name: value for name, value in manifest["data"]["windows"].items()
                                        if name in {"background", "main"}}
    manifest["data"]["extra-objects"] = {}
    manifest["data"]["hotkeys"] = {name: value for name, value in manifest["data"]["hotkeys"].items()
                                       if not name.startswith("mi_")}
    shortcut_slots = {value.get("default"): name for name, value in manifest["data"]["hotkeys"].items() if value.get("default")}
    permissions = set(manifest["permissions"])
    game_events = set()
    for app in CONFIG:
        source = SOURCE_ROOT / app["folder"]
        snapshot = ROOT / "projects" / app["id"]
        snapshot.mkdir(parents=True, exist_ok=True)
        hashes = source_snapshot(source, snapshot)
        version = read_json(source / "package.json")["version"]
        files, release = read_release(source, version, decisions[app["id"]]["release"] if decisions else None)
        original = json.loads(files["manifest.json"].decode("utf-8-sig"))
        prefix = f"/apps/{app['id']}"
        roots = sorted({name.split("/")[0] for name in files})
        pattern = re.compile(r'''(["'`(=])/(%s)(?=[/"'`?#)\s])''' % "|".join(re.escape(name) for name in roots))
        options = {"id": app["id"], "name": app["name"], "prefix": prefix,
                   "roots": roots, "manifest": original,
                   "windows": {name: (name if name in {"main", "background"} else f"mi_{app['id']}_{name}")
                               for name in original["data"]["windows"]}}
        output = ROOT / "public/apps" / app["id"]
        runtime_hashes = {}
        for relative, body in files.items():
            if ".." in Path(relative).parts or Path(relative).is_absolute():
                raise ValueError("Unsafe archive path")
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if Path(relative).suffix in TEXT:
                text = body.decode("utf-8-sig")
                text = pattern.sub(lambda match: match[1] + prefix + "/" + match[2], text)
                if relative.endswith(".html"):
                    bootstrap = "<script>window.__MAP_IT_APP__=" + json.dumps(options, ensure_ascii=False).replace("<", "\\u003c") + ";</script><script src=\"/map-it-runtime.js\"></script>"
                    text = text.replace("<head>", "<head>" + bootstrap, 1)
                body = text.encode("utf-8")
            destination.write_bytes(body)
            runtime_hashes[relative] = hashlib.sha256(body).hexdigest()
        data = original["data"]
        permissions.update(original.get("permissions", []))
        game_events.update(data.get("game_events", []))
        for name, window in data["windows"].items():
            if name in {"main", "background"}:
                continue
            entry = dict(window)
            entry["file"] = f"windows/{options['windows'][name]}.html"
            manifest["data"]["windows"][options["windows"][name]] = entry
            wrapper = ROOT / "public" / entry["file"]
            wrapper.parent.mkdir(parents=True, exist_ok=True)
            wrapper.write_text(f'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{app["name"]}</title><style>html,body,iframe{{width:100%;height:100%;margin:0;border:0;overflow:hidden;background:transparent}}iframe{{display:block}}</style></head><body><iframe title="{app["name"]}" src="/apps/{app["id"]}/{window["file"]}?window={name}"></iframe></body></html>', encoding="utf-8")
        for name, plugin in data.get("extra-objects", {}).items():
            if name in manifest["data"]["extra-objects"]:
                raise ValueError(f"Conflicting native plugin name: {name}")
            manifest["data"]["extra-objects"][name] = {**plugin, "file": f"apps/{app['id']}/{plugin['file']}"}
        options["hotkeys"] = map_hotkeys(app, data.get("hotkeys", {}), manifest["data"]["hotkeys"], shortcut_slots)
        for name, native_name in options["windows"].items():
            if name in {"main", "background"}:
                continue
            entry = manifest["data"]["windows"][native_name]
            release_hotkey = entry.get("focus_game_takeover_release_hotkey")
            if release_hotkey:
                entry["focus_game_takeover_release_hotkey"] = options["hotkeys"][release_hotkey]
        # Re-inject hotkey names after constructing the complete mapping.
        for relative in files:
            if not relative.endswith(".html"):
                continue
            destination = output / relative
            text = destination.read_text(encoding="utf-8")
            text = re.sub(r"window\.__MAP_IT_APP__=.*?;</script>",
                          lambda _: "window.__MAP_IT_APP__=" + json.dumps(options, ensure_ascii=False).replace("<", "\\u003c") + ";</script>", text, count=1)
            destination.write_text(text, encoding="utf-8")
            runtime_hashes[relative] = file_hash(destination)
        item = {"id": app["id"], "name": app["name"], "version": version,
                "entry": data["windows"]["main"]["file"], "background": data["windows"]["background"]["file"],
                "icon": f"{prefix}/{original['meta']['icon']}",
                "gameIds": data.get("game_targeting", {}).get("game_ids", []),
                "windows": options["windows"], "windowFiles": {name: value["file"] for name, value in data["windows"].items()}}
        registry.append(item)
        record = {"id": app["id"], "source": str(source), "release": release, "version": version,
                  "sourceSha256": hashes, "runtimeFiles": len(files), "runtimeBytes": sum(len(body) for body in files.values())}
        if decisions:
            record["sync"] = decisions[app["id"]]
        record["runtimeSha256"] = runtime_hashes
        write_json(snapshot / "snapshot.json", record)
        imports.append(record)
        print(json.dumps({"app": app["name"], "version": version, "sourceFiles": len(hashes), "runtimeFiles": len(files)}, ensure_ascii=False))
    manifest["permissions"] = sorted(permissions)
    manifest["data"]["game_events"] = sorted(game_events)
    manifest["data"]["windows"]["main"]["min_size"]["height"] = 900
    write_host_registry(ROOT, manifest, registry)
    write_json(ROOT / "projects/import-report.json", {"apps": imports})


def write_host_registry(workspace, manifest, registry):
    game_ids = sorted({game_id for app in registry for game_id in app["gameIds"]})
    manifest["data"]["game_targeting"] = {"type": "dedicated", "game_ids": game_ids}
    manifest["data"]["launch_events"] = [{"event": "GameLaunch", "event_data": {"game_ids": game_ids}, "start_minimized": False}]
    write_json(workspace / "public/manifest.json", manifest)
    game_config = workspace / "src/game-config.ts"
    game_config.write_text(re.sub(r"  gameClassIds: \[.*?\],", "  gameClassIds: " + json.dumps(game_ids) + ",",
                                  game_config.read_text(encoding="utf-8")), encoding="utf-8")
    write_json(workspace / "src/features/app-library/map-apps.json", registry)
    write_json(workspace / "public/app-library.json", registry)


def file_hash(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def tree_hash(records):
    return hashlib.sha256(json.dumps(records, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def build_inputs(source):
    """Track additions/deletions as well as same-version edits; never log env values."""
    paths = []
    for name in ["src", "public", "config", "native", "bridge-mod", "build"]:
        if (source / name).is_dir():
            paths.extend(safe_files(source / name))
    for file in source.iterdir():
        if file.is_file() and (file.suffix in {".ts", ".js", ".mjs", ".html"}
                or file.name in {"package.json", "package-lock.json", "content-release.json"}
                or file.name.startswith("tsconfig") or file.name.startswith(".env")):
            paths.append(file)
    records = fingerprint_files(paths, source)
    return records, {p.relative_to(source).as_posix(): p.stat().st_mtime for p in paths}


def release_hash(file):
    if file.is_file():
        return file_hash(file)
    return tree_hash(fingerprint_files(safe_files(file, False), file))


def fingerprint_files(paths, directory):
    with ThreadPoolExecutor(max_workers=8) as pool:
        return dict(pool.map(lambda file: (file.relative_to(directory).as_posix(), file_hash(file)), paths))


def inspect_sources(apps=None):
    decisions = {}
    failures = []
    for app in CONFIG if apps is None else apps:
        source = SOURCE_ROOT / app["folder"]
        version = read_json(source / "package.json")["version"]
        print(f"[sources] Checking {app['id']} {version}")
        candidates = release_candidates(source, version)
        if not candidates:
            failures.append(f"{app['id']}: build the source app first; no complete {version} release exists.")
            continue
        completed, release = candidates[0]
        inputs, times = build_inputs(source)
        snapshot_file = ROOT / "projects" / app["id"] / "snapshot.json"
        previous = read_json(snapshot_file) if snapshot_file.is_file() else {}
        prior = previous.get("sync", {})
        artifact_hash = release_hash(release)
        fingerprint = tree_hash(inputs)
        # Once imported, unchanged artifact bytes cannot certify edited inputs,
        # even if timestamps were restored or the old OPK was touched.
        if prior and prior["releaseSha256"] == artifact_hash and prior["inputSha256"] != fingerprint:
            failures.append(f"{app['id']}: source inputs changed but release bytes did not; rebuild {source}.")
        newer = [name for name, timestamp in times.items() if timestamp > completed]
        if newer:
            failures.append(f"{app['id']}: release predates source inputs ({', '.join(sorted(newer)[:5])}); rebuild {source}.")
        decisions[app["id"]] = {"version": version, "release": str(release),
            "releaseSha256": artifact_hash, "inputSha256": fingerprint,
            "hotkeyAliases": app.get("hotkeyAliases", {}),
            "snapshotSha256": tree_hash(source_snapshot(source))}
        if app.get("hotkeyDefaults"):
            decisions[app["id"]]["hotkeyDefaults"] = app["hotkeyDefaults"]
        if read_json(source / "package.json")["version"] != version:
            failures.append(f"{app['id']}: version changed during source inspection; wait for the solo build to finish and retry.")
        print(json.dumps({"app": app["id"], "version": version,
            "sourceStatus": "unbuilt" if newer else "checked", "release": str(release)}, ensure_ascii=False))
    if failures:
        raise RuntimeError("No imports changed.\n" + "\n".join(failures))
    return decisions


def verify_local_snapshots():
    for app in CONFIG:
        folder = ROOT / "projects" / app["id"]
        print(f"[imports] Checking local changes: {app['id']}")
        record_file = folder / "snapshot.json"
        if not record_file.is_file():
            continue
        record = read_json(record_file)
        actual = source_snapshot(folder)
        expected = record["sourceSha256"]
        if actual != expected:
            raise RuntimeError(f"Local source snapshot edited: {app['id']}. Preserve/reconcile these changes in the source app before importing.")
        if "runtimeSha256" in record:
            runtime = ROOT / "public/apps" / app["id"]
            actual = fingerprint_files(safe_files(runtime, False), runtime)
            if actual != record["runtimeSha256"]:
                raise RuntimeError(f"Imported runtime edited: {app['id']}. Refusing to overwrite local changes.")


def contained(file, parent):
    file = file.resolve()
    parent = parent.resolve()
    if file == parent or not file.is_relative_to(parent):
        raise RuntimeError(f"Managed path escaped its workspace: {file}")
    return file


def retain_host_registry(workspace, stage, app_id):
    library = "public/app-library.json"
    registry = read_json(workspace / library)
    existing = next((app for app in registry if app["id"] == app_id), None)
    incoming, = read_json(stage / library)
    if existing is None or {**existing, "gameIds": incoming["gameIds"]} != incoming:
        raise RuntimeError(f"{app_id}: the library entry changed; use a full import to update host routing.")
    ids_changed = existing["gameIds"] != incoming["gameIds"]

    def routing(directory):
        file = directory / "public/apps" / app_id / incoming["entry"]
        match = re.search(r"window\.__MAP_IT_APP__=(.*?);</script>", file.read_text(encoding="utf-8"), re.S)
        if not match:
            raise RuntimeError(f"{app_id}: missing runtime bootstrap in {file}.")
        options = json.loads(match[1])
        options.pop("roots", None)
        if ids_changed:
            data = options["manifest"]["data"]
            data["game_targeting"].pop("game_ids", None)
            for event in data.get("launch_events", []):
                if event["event"] == "GameLaunch":
                    event.get("event_data", {}).pop("game_ids", None)
        return options

    if routing(workspace) != routing(stage):
        raise RuntimeError(f"{app_id}: the manifest or hotkey routing changed; use a full import.")

    report_path = "projects/import-report.json"
    report = read_json(workspace / report_path)
    replacement, = read_json(stage / report_path)["apps"]
    report["apps"] = [replacement if app["id"] == app_id else app for app in report["apps"]]
    write_json(stage / report_path, report)
    if ids_changed:
        other_game_ids = {game_id for app in registry if app["id"] != app_id for game_id in app["gameIds"]}
        if other_game_ids.intersection(incoming["gameIds"]):
            raise RuntimeError(f"{app_id}: new game IDs overlap another module's targets.")
        registry[registry.index(existing)] = incoming
        write_host_registry(stage, read_json(workspace / "public/manifest.json"), registry)
    return ids_changed


def sync_apps(check_only=False, verify_only=False, only_app=None):
    global ROOT, CONFIG
    workspace = ROOT
    cache = workspace / ".sync-cache"
    journal = cache / "transaction.json"
    if journal.exists():
        raise RuntimeError(f"Interrupted import transaction; preserve and recover the paths recorded in {journal} before retrying.")
    selected = CONFIG if only_app is None else [app for app in CONFIG if app["id"] == only_app]
    if not selected:
        raise RuntimeError(f"Unknown app: {only_app}")
    verify_local_snapshots()
    decisions = inspect_sources(selected)
    old = {app["id"]: read_json(workspace / "projects" / app["id"] / "snapshot.json")
           if (workspace / "projects" / app["id"] / "snapshot.json").exists() else {} for app in selected}
    changed = [key for key in decisions if decisions[key] != old[key].get("sync")]
    print(json.dumps({"changedApps": changed, "mode": "check" if check_only else "sync"}))
    if verify_only and changed:
        raise RuntimeError("Source apps changed during the Map It build: " + ", ".join(changed))
    if check_only or verify_only or not changed:
        return
    host_inputs = ["public/manifest.json", "src/game-config.ts", "config/map-apps.json"]
    if only_app:
        host_inputs.extend(["public/app-library.json", "src/features/app-library/map-apps.json", "projects/import-report.json"])
    host_before = {name: file_hash(workspace / name) if (workspace / name).is_file() else None for name in host_inputs}
    stage = cache / ("stage-" + uuid.uuid4().hex)
    backup = cache / ("backup-" + uuid.uuid4().hex)
    stage.mkdir(parents=True)
    # The old runnable tree remains in place until every app has imported.
    for relative in ["public/manifest.json", "src/game-config.ts"]:
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(workspace / relative, target)
    full_config = CONFIG
    try:
        ROOT, CONFIG = stage, selected
        main(decisions)
    finally:
        ROOT, CONFIG = workspace, full_config
    update_game_ids = only_app and retain_host_registry(workspace, stage, only_app)
    if inspect_sources(selected) != decisions:
        raise RuntimeError(f"Source apps changed while importing. Staged files retained at {stage}; active imports unchanged.")
    if any((file_hash(workspace / name) if (workspace / name).is_file() else None) != expected for name, expected in host_before.items()):
        raise RuntimeError("Map It import configuration changed while staging; active files were preserved. Retry the build.")
    verify_local_snapshots()
    paths = []
    for app in selected:
        app_id = app["id"]
        project = f"projects/{app_id}"
        incoming = read_json(stage / project / "snapshot.json")
        # The merged hotkey registry can change another app's generated HTML
        # even when that app's solo release is unchanged. Compare staged bytes.
        if incoming != old[app_id]:
            paths.append(project)
            # Keep private publishing profiles outside snapshots/runtime.
            for file in (workspace / project).glob(".env*"):
                if file.is_file():
                    shutil.copy2(file, stage / project / file.name)
        if incoming["runtimeSha256"] != old[app_id].get("runtimeSha256"):
            paths.append(f"public/apps/{app_id}")
    paths.append("projects/import-report.json")
    if not only_app or update_game_ids:
        paths += ["public/manifest.json", "src/game-config.ts",
                  "src/features/app-library/map-apps.json", "public/app-library.json"]
    if not only_app:
        paths.append("public/windows")
        # Preserve host-owned wrappers if any; replace only generated game wrappers.
        windows = workspace / "public/windows"
        (stage / "public/windows").mkdir(parents=True, exist_ok=True)
        if windows.exists():
            for file in windows.iterdir():
                if file.is_file() and not file.name.startswith("mi_"):
                    shutil.copy2(file, stage / "public/windows" / file.name)
    operations = []
    try:
        for relative in paths:
            target = contained(workspace / relative, workspace)
            incoming = contained(stage / relative, stage)
            saved = contained(backup / relative, backup)
            saved.parent.mkdir(parents=True, exist_ok=True)
            operation = {"target": str(target), "backup": str(saved), "incoming": str(incoming), "hadOriginal": target.exists()}
            operations.append(operation)
            write_json(journal, operations)
            if target.exists():
                target.rename(saved)
            target.parent.mkdir(parents=True, exist_ok=True)
            incoming.rename(target)
    except BaseException:
        for op in reversed(operations):
            target, saved, incoming = map(Path, [op["target"], op["backup"], op["incoming"]])
            if not incoming.exists() and target.exists():
                incoming.parent.mkdir(parents=True, exist_ok=True)
                target.rename(incoming)
            if saved.exists():
                saved.rename(target)
        journal.unlink(missing_ok=True)
        raise
    journal.unlink()
    shutil.rmtree(contained(stage, cache), ignore_errors=True)
    print(json.dumps({"status": "synced", "apps": changed, "previousImports": str(backup)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--app", help="Refresh one imported app and its game IDs without changing other apps.")
    args = parser.parse_args()
    try:
        sync_apps(args.check_only, args.verify_only, args.app)
    except Exception as error:
        print(f"App synchronization stopped: {error}", file=sys.stderr)
        sys.exit(1)
