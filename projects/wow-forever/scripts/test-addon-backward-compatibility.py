"""Run legacy contracts against the assembled live addon without game/CDN writes.

Requires lupa; use the same temporary PYTHONPATH as test-live-sync-prototype.py.
This is a Lua regression test, not an Overwolf runtime certification.
"""
from importlib import util, import_module
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = util.spec_from_file_location("legacy_fixture", ROOT / "scripts/test-character-addon.py")
fixture = util.module_from_spec(spec)
spec.loader.exec_module(fixture)
BASELINE = fixture.SOURCE
fixture.HARNESS += "\nfunction GetTime() return clock end\n"
fixture.SOURCE += "\ndo\n" + (ROOT / "addons/position-bridge/character-live.lua").read_text(encoding="utf-8") + "\nend\n"


def plain(value):
    if hasattr(value, "items"):
        return {k: plain(v) for k, v in value.items()}
    return value


class CombinedAddonTests(fixture.AddonTests):
    def test_saved_database_matches_legacy_collector_after_events(self):
        old = import_module(self.runtime_module).LuaRuntime(unpack_returned_tuples=True)
        old.execute(fixture.HARNESS)
        old.execute(BASELINE, "wfm-position-bridge")
        old.execute('event("ADDON_LOADED", "wfm-position-bridge"); event("PLAYER_LOGIN"); advance(1)')
        events = '''
            function GetMoney() return 4321 end
            event("PLAYER_MONEY"); event("BAG_UPDATE_DELAYED")
            event("QUEST_LOG_UPDATE"); event("BANKFRAME_OPENED")
            event("TRADE_SKILL_SHOW"); advance(1)
        '''
        old.execute(events)
        self.lua.execute(events + '\nWFM_CharacterLiveTicker.fn()')
        self.assertEqual(plain(old.globals().WFM_CharacterDB), plain(self.lua.globals().WFM_CharacterDB))
        self.check('WFM_CharacterLiveBridge[7] == 1')

    def test_live_serialization_error_does_not_break_position_or_saved_data(self):
        self.lua.execute('''
            local c = WFM_CharacterDB.characters[WFM_CharacterDB.current]
            c.testCycle = c
            WFM_CharacterLiveTicker.fn()
            WFT.fn()
            event("PLAYER_MONEY"); advance(1)
        ''')
        self.check('WFM_CharacterLiveBridge[7] == 3')
        self.check('WFM[2] == 2 and WFM[3] == 10 and WFM[8] == 9753124682')
        self.check('WFM_CharacterDB.characters[WFM_CharacterDB.current].money == 12345')

    def test_oversized_live_frame_does_not_break_position_or_saved_data(self):
        self.lua.execute('''
            WFM_CharacterDB.characters[WFM_CharacterDB.current].testLarge = string.rep("x", 270000)
            WFM_CharacterLiveTicker.fn()
            WFT.fn()
        ''')
        self.check('WFM_CharacterLiveBridge[7] == 2')
        self.check('WFM[2] == 2 and WFM[7] == 1426')
        self.check('WFM_CharacterDB.schemaVersion == 1')
        self.check('WFM_CharacterDB.characters[WFM_CharacterDB.current].bags.counts["200"] == 7')


class CombinedLua54Tests(CombinedAddonTests):
    runtime_module = "lupa.lua54"


if __name__ == "__main__":
    unittest.main()
