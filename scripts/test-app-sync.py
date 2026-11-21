import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("app_sync", Path(__file__).with_name("import-map-apps.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class AppSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.root = self.base / "map-it"
        self.source = self.base / "solo"
        self.root.mkdir(); self.source.mkdir()
        self.saved = sync.ROOT, sync.SOURCE_ROOT, sync.CONFIG
        sync.ROOT, sync.SOURCE_ROOT = self.root, self.base
        sync.CONFIG = [{"id": "game", "name": "Game", "folder": "solo"}]
        self.timestamp = time.time() - 100
        self.manifest = {"meta": {"version": "1.0.0", "icon": "icon.png"}, "permissions": [], "data": {
            "windows": {"main": {"file": "index.html", "min_size": {"height": 900}}, "background": {"file": "background.html"}},
            "hotkeys": {}, "game_targeting": {"game_ids": [123]}, "game_events": []}}
        self.write(self.root / "public/manifest.json", self.manifest)
        self.write(self.root / "src/game-config.ts", "export const config = {\n  gameClassIds: [],\n};")
        self.write(self.source / "package.json", {"version": "1.0.0"})
        self.write(self.source / "src/app.ts", "export const feature = 1;")
        self.write(self.source / "public/manifest.json", self.manifest)
        self.release()

    def tearDown(self):
        sync.ROOT, sync.SOURCE_ROOT, sync.CONFIG = self.saved
        self.temp.cleanup()

    def write(self, path, body):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(body) if not isinstance(body, str) else body, encoding="utf-8")
        os.utime(path, (self.timestamp, self.timestamp))

    def release(self, extra=None, stamp=30, manifest=None):
        self.archive = self.source / "solo-1.0.0.opk"
        files = {"manifest.json": json.dumps(manifest or self.manifest), "index.html": "<head></head>", "background.html": "<head></head>", "icon.png": "icon", **(extra or {})}
        with zipfile.ZipFile(self.archive, "w") as archive:
            for name, body in files.items(): archive.writestr(name, body)
        os.utime(self.archive, (self.timestamp + stamp, self.timestamp + stamp))

    def test_newer_source_stops_before_any_import_changes(self):
        file = self.source / "src/app.ts"
        os.utime(file, (self.timestamp + 40, self.timestamp + 40))
        before = (self.root / "public/manifest.json").read_bytes()
        with self.assertRaisesRegex(RuntimeError, "predates"):
            sync.sync_apps()
        self.assertEqual(before, (self.root / "public/manifest.json").read_bytes())
        self.assertFalse((self.root / "projects").exists())

    def test_same_version_change_with_restored_time_rejected(self):
        sync.sync_apps()
        self.write(self.source / "src/app.ts", "export const feature = 2;")
        with self.assertRaisesRegex(RuntimeError, "release bytes did not"):
            sync.sync_apps()

    def test_added_and_deleted_inputs_detected(self):
        sync.sync_apps()
        self.write(self.source / "src/new.ts", "export const added = true;")
        with self.assertRaisesRegex(RuntimeError, "release bytes did not"): sync.sync_apps()
        (self.source / "src/new.ts").unlink()
        (self.source / "src/app.ts").unlink()
        with self.assertRaisesRegex(RuntimeError, "release bytes did not"): sync.sync_apps()

    def test_refresh_removes_obsolete_runtime_and_preserves_private_profile(self):
        self.release({"assets/old.js": "old"})
        sync.sync_apps()
        self.write(self.root / "projects/game/.env", "LOCAL_SECRET=private")
        self.release({"assets/new.js": "new"}, stamp=40)
        sync.sync_apps()
        self.assertFalse((self.root / "public/apps/game/assets/old.js").exists())
        self.assertTrue((self.root / "public/apps/game/assets/new.js").exists())
        self.assertEqual((self.root / "projects/game/.env").read_text(), "LOCAL_SECRET=private")
        self.assertFalse(list((self.root / "public/apps").rglob(".env*")))

    def test_new_game_keeps_identical_import_directories_in_place(self):
        sync.sync_apps()
        existing = {self.root / "projects/game", self.root / "public/apps/game"}
        original = Path.rename

        def rename(file, target):
            if file in existing or target in existing:
                raise OSError("unchanged import is in use")
            return original(file, target)

        sync.CONFIG = [*sync.CONFIG, {"id": "other", "name": "Other", "folder": "solo"}]
        with patch.object(Path, "rename", rename):
            sync.sync_apps()
        self.assertTrue((self.root / "public/apps/other/index.html").is_file())
        self.assertFalse(list((self.root / ".sync-cache").glob("stage-*")))

    def test_scoped_refresh_reuses_other_imports_when_their_sources_change(self):
        other = self.base / "other"
        shutil.copytree(self.source, other)
        sync.CONFIG = [*sync.CONFIG, {"id": "other", "name": "Other", "folder": "other"}]
        sync.sync_apps()
        retained = [self.root / name for name in (
            "projects/other/snapshot.json", "public/manifest.json", "public/app-library.json",
        )]
        before = [file.read_bytes() for file in retained]
        self.write(other / "src/app.ts", "export const feature = 2;")
        self.release({"assets/refreshed.js": "new"}, stamp=40)

        with self.assertRaisesRegex(RuntimeError, "release bytes did not"):
            sync.sync_apps(check_only=True)
        sync.sync_apps(only_app="game")
        sync.sync_apps(verify_only=True, only_app="game")

        self.assertEqual([file.read_bytes() for file in retained], before)
        self.assertTrue((self.root / "public/apps/game/assets/refreshed.js").is_file())
        self.assertEqual([app["id"] for app in sync.read_json(self.root / "projects/import-report.json")["apps"]],
                         ["game", "other"])

    def test_scoped_refresh_requires_unchanged_routing(self):
        sync.sync_apps()
        runtime = self.root / "public/apps/game/index.html"
        before = runtime.read_bytes()
        self.release(stamp=40, manifest={**self.manifest, "permissions": ["GameInfo"]})

        with self.assertRaisesRegex(RuntimeError, "manifest or hotkey routing changed"):
            sync.sync_apps(only_app="game")
        self.assertEqual(runtime.read_bytes(), before)

    def test_local_snapshot_and_runtime_edits_are_not_overwritten(self):
        sync.sync_apps()
        self.write(self.root / "projects/game/src/app.ts", "local edit")
        with self.assertRaisesRegex(RuntimeError, "snapshot edited"): sync.sync_apps()
        self.write(self.root / "projects/game/src/app.ts", "export const feature = 1;")
        self.write(self.root / "public/apps/game/icon.png", "local edit")
        with self.assertRaisesRegex(RuntimeError, "runtime edited"): sync.sync_apps()

    def test_newer_dist_wins_over_same_version_old_opk(self):
        for name, body in {"manifest.json": self.manifest, "index.html": "<head>new</head>", "background.html": "<head></head>"}.items():
            file = self.source / "dist" / name
            self.write(file, body)
            os.utime(file, (self.timestamp + 50, self.timestamp + 50))
        self.assertEqual(sync.release_candidates(self.source, "1.0.0")[0][1], self.source / "dist")

    def test_unchanged_build_reuses_imports_and_final_check_rejects_new_release(self):
        sync.sync_apps()
        file = self.root / "public/apps/game/index.html"
        stamp = file.stat().st_mtime_ns
        sync.sync_apps()
        sync.sync_apps(verify_only=True)
        self.assertEqual(file.stat().st_mtime_ns, stamp)
        self.release({"new.txt": "new"}, stamp=40)
        with self.assertRaisesRegex(RuntimeError, "changed during"):
            sync.sync_apps(verify_only=True)
        self.assertEqual(file.stat().st_mtime_ns, stamp)

    def test_archive_version_and_private_files_rejected(self):
        self.release(manifest={**self.manifest, "meta": {"version": "0.9.0"}})
        with self.assertRaisesRegex(RuntimeError, "version mismatch"): sync.release_candidates(self.source, "1.0.0")
        self.release({".env": "secret"})
        with self.assertRaisesRegex(ValueError, "Private/build"): sync.read_release(self.source, "1.0.0")
        self.release({"../escape.txt": "bad"})
        with self.assertRaisesRegex(ValueError, "Unsafe"): sync.read_release(self.source, "1.0.0")

    def test_failed_switch_rolls_back_previous_imports(self):
        sync.sync_apps()
        before = (self.root / "public/apps/game/index.html").read_bytes()
        self.release({"new.txt": "new"}, stamp=40)
        original = Path.rename
        failed = False
        def rename(file, target):
            nonlocal failed
            if not failed and "stage-" in str(file) and str(file).endswith(str(Path("public/apps/game"))):
                failed = True
                raise OSError("simulated locked file")
            return original(file, target)
        with patch.object(Path, "rename", rename):
            with self.assertRaisesRegex(OSError, "simulated"): sync.sync_apps()
        self.assertEqual(before, (self.root / "public/apps/game/index.html").read_bytes())
        self.assertFalse((self.root / "public/apps/game/new.txt").exists())
        self.assertFalse((self.root / ".sync-cache/transaction.json").exists())

    def test_hotkey_alias_change_refreshes_an_unchanged_release(self):
        host = json.loads(json.dumps(self.manifest))
        host["data"]["hotkeys"] = {"toggle_app": {"default": "Ctrl+Shift+A"},
                                    "toggle_desktop_app": {"default": "Ctrl+Shift+D"}}
        self.write(self.root / "public/manifest.json", host)
        self.manifest["data"]["hotkeys"] = {"toggle_app": {"default": "Ctrl+Shift+D"}}
        self.release()
        sync.sync_apps()
        sync.CONFIG[0]["hotkeyAliases"] = {"toggle_app": "toggle_desktop_app"}
        sync.sync_apps()
        html = (self.root / "public/apps/game/index.html").read_text()
        self.assertIn('"hotkeys": {"toggle_app": "toggle_desktop_app"}', html)

    def test_host_edits_during_staging_are_preserved(self):
        original = sync.main
        def stage(decisions):
            original(decisions)
            self.write(self.root / "src/game-config.ts", "// concurrent host edit")
        with patch.object(sync, "main", stage):
            with self.assertRaisesRegex(RuntimeError, "configuration changed"):
                sync.sync_apps()
        self.assertEqual((self.root / "src/game-config.ts").read_text(), "// concurrent host edit")
        self.assertFalse((self.root / "public/apps").exists())


class HotkeyMappingTests(unittest.TestCase):
    def host(self):
        return {name: {"default": binding} for name, binding in {
            "toggle_desktop_app": "Ctrl+A", "toggle_app": "Ctrl+D",
            "toggle_overlay": "Ctrl+Shift+M"}.items()}

    def test_legacy_desktop_names_do_not_claim_in_game_shortcut(self):
        for app_id in ["elden-ring", "peak", "valheim"]:
            with self.subTest(app=app_id):
                app = next(app for app in sync.CONFIG if app["id"] == app_id)
                host = self.host()
                native = {"toggle_app": {"default": "Ctrl+Shift+D"},
                          "toggle_overlay": {"default": "Ctrl+M"}}
                if app_id == "valheim":
                    native["toggle_in_game_app"] = {"default": "Ctrl+Shift+A"}
                mapping = sync.map_hotkeys(app, native, host, {})
                self.assertEqual(mapping["toggle_app"], "toggle_desktop_app")
                self.assertEqual(mapping["toggle_overlay"], "toggle_overlay")
                if app_id == "valheim":
                    self.assertEqual(mapping["toggle_in_game_app"], "toggle_app")
                else:
                    self.assertNotIn("toggle_app", mapping.values())
                self.assertEqual(set(mapping), set(native))

    def test_standard_windows_and_extra_actions_remain_distinct(self):
        host = self.host()
        app = next(app for app in sync.CONFIG if app["id"] == "elden-ring")
        native = {"toggle_app": {"default": "Ctrl+Shift+D"},
                  "toggle_overlay": {"default": "Ctrl+M"},
                  "dismiss_overlay": {"default": "Ctrl+Shift+M", "title": "Hide Map"}}
        slots = {item["default"]: name for name, item in host.items()}
        mapping = sync.map_hotkeys(app, native, host, slots)
        self.assertEqual(mapping["toggle_app"], "toggle_desktop_app")
        self.assertEqual(mapping["toggle_overlay"], "toggle_overlay")
        self.assertEqual(mapping["dismiss_overlay"], "mi_elden-ring_dismiss_overlay")
        self.assertEqual(host["mi_elden-ring_dismiss_overlay"]["default"], "Ctrl+Shift+H")


if __name__ == "__main__": unittest.main()
