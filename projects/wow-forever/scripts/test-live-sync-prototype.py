"""Exercise the local collector/publisher in Lua 5.1 and 5.4; emit native decoder fixtures."""
from importlib import import_module, util
import json
from pathlib import Path
import struct
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
spec = util.spec_from_file_location("character_addon_fixture", ROOT / "scripts/test-character-addon.py")
fixture = util.module_from_spec(spec)
spec.loader.exec_module(fixture)
PUBLISHER = (ROOT / "addons/position-bridge/character-live.lua").read_text(encoding="utf-8").replace("WFM_CharacterDB", "WFM_LocalCharacterDB").replace("WFM_CharacterLive", "WFM_LocalLive")
COLLECTOR = fixture.SNAPSHOT.replace("WFM_CharacterDB", "WFM_LocalCharacterDB")
CAPACITY = 65536
SLOTS = CAPACITY + 11
OUT = ROOT / ".local/live-sync-prototype/fixtures"


class LiveSyncTests(unittest.TestCase):
    runtime_module = "lupa.lua51"

    def setUp(self):
        self.lua = import_module(self.runtime_module).LuaRuntime(unpack_returned_tuples=True)
        self.lua.execute(fixture.HARNESS)
        self.lua.execute('clock = 1793836800; function GetTime() return clock - 1793800000 end; WFM_CharacterDB = {untouched = true}')
        self.lua.execute("do\n" + COLLECTOR + "\nend\n" + PUBLISHER, "wfm-live-sync-prototype")
        self.lua.execute('event("ADDON_LOADED", "wfm-live-sync-prototype"); event("PLAYER_LOGIN"); advance(1)')

    def publish(self):
        self.lua.execute("tickers[#tickers].fn()")
        return self.lua.globals().WFM_LocalLiveBridge

    def payload(self):
        bridge = self.publish()
        self.assertEqual(bridge[7], 1)
        words = b"".join(struct.pack("<I", int(bridge[11 + i])) for i in range((int(bridge[5]) + 3) // 4))
        raw = words[:int(bridge[5])]
        self.assertEqual(zlib.adler32(raw), int(bridge[6]))
        return json.loads(raw)

    def test_current_character_and_utf8_round_trip(self):
        self.lua.execute('function UnitName() return \'Türkçe "quoted" \\\\ line\\n\' end; event("PLAYER_MONEY"); advance(1)')
        data = self.payload()
        character = data["characters"][data["current"]]
        self.assertEqual(character["name"], 'Türkçe "quoted" \\ line\n')
        self.assertEqual(character["bags"]["counts"]["200"], 7)
        self.assertEqual(character["quests"]["active"]["400"]["objectives"]["1"]["have"], 3)
        self.assertTrue(self.lua.globals().WFM_CharacterDB.untouched)

    def test_game_events_change_payload_without_reloading_source(self):
        first = self.payload()
        first_session = self.lua.globals().WFM_LocalLiveBridge[10]
        self.lua.execute('''
function GetMoney() return 12300 end
function UnitXP() return 700 end
function C_Container.GetContainerItemInfo(bag, slot)
    if bag == 0 and slot == 1 then return {itemID=200, stackCount=8} end
end
function C_QuestLog.GetQuestObjectives()
    return {{text="Collected: 4/8", type="item", finished=false, numFulfilled=4, numRequired=8}}
end
event("PLAYER_MONEY"); event("PLAYER_XP_UPDATE"); event("BAG_UPDATE_DELAYED"); event("QUEST_LOG_UPDATE"); advance(1)
''')
        second = self.payload()
        character = second["characters"][second["current"]]
        self.assertNotEqual(first, second)
        self.assertEqual(character["money"], 12300)
        self.assertEqual(character["xp"], 700)
        self.assertEqual(character["bags"]["counts"]["200"], 8)
        self.assertEqual(character["quests"]["active"]["400"]["objectives"]["1"]["have"], 4)
        self.assertEqual(self.lua.globals().WFM_LocalLiveBridge[10], first_session)
        self.assertEqual(len(self.lua.globals().frames), 1)
        OUT.mkdir(parents=True, exist_ok=True)
        bridge = self.lua.globals().WFM_LocalLiveBridge
        for stride in (8, 16, 24, 32):
            buf = bytearray((SLOTS - 1) * stride + 8)
            for i in range(SLOTS):
                struct.pack_into("<d", buf, i * stride, bridge[i + 1])
            (OUT / f"{self.runtime_module.split('.')[-1]}-{stride}.bin").write_bytes(buf)

    def test_unknown_or_secret_character_is_not_published_as_old_character(self):
        self.payload()
        self.lua.execute('player = "Player-2-B"')
        self.assertEqual(self.publish()[7], 0)
        self.lua.execute('player = secret')
        self.assertEqual(self.publish()[7], 0)

    def test_oversized_and_secret_payloads_have_explicit_error_status(self):
        self.lua.execute('WFM_LocalCharacterDB.characters[player].name = string.rep("x", 300000)')
        self.assertEqual(self.publish()[7], 2)
        self.assertEqual(self.lua.globals().WFM_LocalLiveBridge[5], 0)
        self.lua.execute('WFM_LocalCharacterDB.characters[player].name = secret')
        self.assertEqual(self.publish()[7], 3)

    def test_loading_publisher_again_cancels_previous_ticker_and_changes_session(self):
        self.publish()
        session = self.lua.globals().WFM_LocalLiveBridge[10]
        self.lua.execute("advance(2)")
        self.lua.execute(PUBLISHER)
        self.assertTrue(self.lua.globals().tickers[1].cancelled)
        self.assertNotEqual(self.lua.globals().WFM_LocalLiveBridge[10], session)


class LiveSyncLua54Tests(LiveSyncTests):
    runtime_module = "lupa.lua54"


if __name__ == "__main__":
    unittest.main()
