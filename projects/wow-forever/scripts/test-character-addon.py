"""Execute the maintained addon in real Lua 5.1 and 5.4 with controlled game APIs.

Requires lupa (can be installed in a temporary directory and supplied via PYTHONPATH).
No game files, SavedVariables, network requests or live player data are used.
"""
from pathlib import Path
from importlib import import_module
import unittest

ROOT = Path(__file__).resolve().parents[1]
POSITION = (ROOT / "addons/position-bridge/position.lua").read_text(encoding="utf-8")
SNAPSHOT = (ROOT / "addons/position-bridge/character-snapshot.lua").read_text(encoding="utf-8")
SOURCE = POSITION + "\ndo\n" + SNAPSHOT + "\nend\n"
HARNESS = r'''
clock = 1000
timers = {}
tickers = {}
frames = {}
player = "Player-1-A"
secret = {}
function issecretvalue(v) return v == secret end
function time() return clock end
function CreateFrame()
    local frame = { events = {} }
    function frame:RegisterEvent(event) self.events[event] = true end
    function frame:SetScript(_, fn) self.handler = fn end
    frames[#frames + 1] = frame
    return frame
end
C_Timer = {}
function C_Timer.After(delay, fn) timers[#timers + 1] = { at = clock + delay, fn = fn } end
function C_Timer.NewTicker(delay, fn)
    local ticker = { fn = fn, delay = delay }
    function ticker:Cancel() self.cancelled = true end
    tickers[#tickers + 1] = ticker
    return ticker
end
function advance(seconds)
    clock = clock + seconds
    local due, future = {}, {}
    for _, t in ipairs(timers) do
        if t.at <= clock then due[#due + 1] = t else future[#future + 1] = t end
    end
    timers = future
    for _, t in ipairs(due) do t.fn() end
end
function event(name, ...)
    for _, frame in ipairs(frames) do if frame.events[name] then frame.handler(frame, name, ...) end end
end
function UnitGUID(unit) assert(unit == "player"); return player end
function UnitName(unit) assert(unit == "player"); return "Test character" end
function GetRealmName() return "Test realm" end
function GetCurrentRegion() return 3 end
function UnitClass(unit) assert(unit == "player"); return "Mage", "MAGE", 8 end
function UnitRace(unit) assert(unit == "player"); return "Gnome", "Gnome", 7 end
function UnitFactionGroup() return "Alliance" end
function UnitLevel() return 24 end
function UnitXP() return 500 end
function UnitXPMax() return 3000 end
function GetMoney() return 12345 end
function GetRealZoneText() return "Zone" end
function GetSubZoneText() return "Subzone" end
function GetInventoryItemID(_, slot) if slot == 1 then return 100 end end
function GetLocale() return "deDE" end
function GetBuildInfo() return "1.60.1", "70790", "date", 16001 end
C_AddOns = { GetAddOnMetadata = function(_, field) if field == "Version" then return "0.1.2" end end }
function UnitPosition() return 10, 20, 30, 0 end
C_Map = { GetBestMapForUnit = function() return 1426 end }
C_Container = {}
function C_Container.GetContainerNumSlots(bag) return bag == 0 and 2 or bag == -1 and 1 or 0 end
function C_Container.GetContainerItemInfo(bag, slot)
    if bag == 0 and slot == 1 then return {itemID = 200, stackCount = 7} end
    if bag == -1 then return {itemID = 200, stackCount = 4} end
end
function GetProfessions() return 1, nil, nil, nil, 5, nil end
function GetProfessionInfo(index)
    if index == 1 then return "Alchemy", nil, 50, 75, nil, nil, 171, 0 end
    return "Cooking", nil, 25, 75, nil, nil, 185, 0
end
C_TradeSkillUI = {}
function C_TradeSkillUI.GetBaseProfessionInfo() return {professionID = 171, professionName = "Alchemy", skillLevel = 50, maxSkillLevel = 75} end
function C_TradeSkillUI.GetAllRecipeIDs() return {300, 301} end
function C_TradeSkillUI.GetRecipeInfo(id) return {learned = id == 300} end
C_QuestLog = {}
function C_QuestLog.GetNumQuestLogEntries() return 2 end
function C_QuestLog.GetInfo(i)
    if i == 1 then return {isHeader = true} end
    return {questID = 400, title = "Test quest", level = 20, isComplete = false}
end
function C_QuestLog.GetQuestObjectives() return {{text = "Collected: 3/8", type = "item", finished = false, numFulfilled = 3, numRequired = 8}} end
function C_QuestLog.GetAllCompletedQuestIDs() return {401, 402} end
'''


class AddonTests(unittest.TestCase):
    runtime_module = "lupa.lua51"

    def setUp(self):
        self.lua = import_module(self.runtime_module).LuaRuntime(unpack_returned_tuples=True)
        self.lua.execute(HARNESS)
        self.lua.execute(SOURCE, "wfm-position-bridge")
        self.lua.execute('event("ADDON_LOADED", "wfm-position-bridge"); event("PLAYER_LOGIN"); advance(1)')

    def check(self, expression):
        self.assertTrue(self.lua.eval(expression), expression)

    def test_identity_and_profession_holes(self):
        self.check('WFM_CharacterDB.current == "Player-1-A"')
        self.check('WFM_CharacterDB.characters["Player-1-A"].classId == 8')
        self.check('#WFM_CharacterDB.characters["Player-1-A"].professions.entries == 2')
        self.check('WFM_CharacterDB.characters["Player-1-A"].professions.entries[2].skillLineId == 185')
        self.check('WFM_CharacterDB.characters["Player-1-A"].professions.entries[1].type == "primary"')
        self.check('WFM_CharacterDB.characters["Player-1-A"].professions.entries[2].type == "secondary"')
        self.check('WFM_CharacterDB.addonVersion == "0.1.2" and WFM_CharacterDB.interface == 16001')

    def test_profession_types_follow_slots_even_with_a_missing_first_primary(self):
        self.lua.execute(r'''
            function GetProfessions() return nil, 2, 3, 4, 5, 6 end
            event("SKILL_LINES_CHANGED"); advance(1)
        ''')
        self.check('#WFM_CharacterDB.characters["Player-1-A"].professions.entries == 5')
        self.check('WFM_CharacterDB.characters["Player-1-A"].professions.entries[1].type == "primary"')
        for index in range(2, 6):
            self.check(f'WFM_CharacterDB.characters["Player-1-A"].professions.entries[{index}].type == "secondary"')

    def test_bags_quests_and_objectives(self):
        self.check('WFM_CharacterDB.characters["Player-1-A"].bags.counts["200"] == 7')
        self.check('WFM_CharacterDB.characters["Player-1-A"].quests.active["400"].objectives[1].have == 3')
        self.check('WFM_CharacterDB.characters["Player-1-A"].quests.active["400"].objectives[1].need == 8')
        self.check('WFM_CharacterDB.characters["Player-1-A"].completedQuests.ids["402"] == true')
        self.check('next(WFM_CharacterDB.errors) == nil')

    def test_bank_close_cancels_late_capture(self):
        self.check('WFM_CharacterDB.characters["Player-1-A"].bank == nil')
        self.lua.execute('event("BANKFRAME_OPENED"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].bank.counts["200"] == 4')
        self.lua.execute('event("BANKFRAME_CLOSED"); C_Container.GetContainerItemInfo = function() return nil end; advance(5); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].bank.counts["200"] == 4')

    def test_recipes_are_partial_observations(self):
        self.lua.execute('event("TRADE_SKILL_SHOW"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].learned["300"] == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].learned["301"] == nil')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].complete == false')
        self.lua.execute('C_TradeSkillUI.GetAllRecipeIDs = function() return {} end; event("TRADE_SKILL_LIST_UPDATE"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].learned["300"] == true')

    def test_explicit_unlearned_recipe_state_and_transitions(self):
        self.lua.execute('event("TRADE_SKILL_LIST_UPDATE"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].unlearned["301"] == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].learned["301"] == nil')
        self.lua.execute('C_TradeSkillUI.GetRecipeInfo = function() return {learned = true} end; event("TRADE_SKILL_LIST_UPDATE"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].learned["301"] == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].unlearned["301"] == nil')
        self.lua.execute('C_TradeSkillUI.GetRecipeInfo = function() return {learned = false} end; event("TRADE_SKILL_LIST_UPDATE"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].unlearned["300"] == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].learned["300"] == nil')
        self.lua.execute('C_TradeSkillUI.GetAllRecipeIDs = function() return {} end; event("TRADE_SKILL_LIST_UPDATE"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].unlearned["300"] == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].unlearned["999"] == nil')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes["171"].complete == false')

    def test_event_bursts_are_coalesced(self):
        self.lua.execute('for i=1,100 do event("QUEST_LOG_UPDATE"); event("PLAYER_MONEY") end')
        self.check('#timers == 1')
        self.lua.execute('advance(1)')
        self.check('next(WFM_CharacterDB.errors) == nil')

    def test_restricted_and_failed_reads_preserve_data(self):
        self.lua.execute('C_Container.GetContainerItemInfo = function() return secret end; event("BAG_UPDATE_DELAYED"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].bags.counts["200"] == 7')
        self.lua.execute('C_QuestLog.GetAllCompletedQuestIDs = function() return {secret} end; event("QUEST_TURNED_IN"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].completedQuests.ids["402"] == true')
        self.lua.execute('C_Container.GetContainerNumSlots = function() error("unavailable") end; event("BAG_UPDATE_DELAYED"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"].bags.counts["200"] == 7')

    def test_character_isolation_and_reload(self):
        self.lua.execute('player = "Player-1-B"; event("PLAYER_LOGIN"); advance(1)')
        self.check('WFM_CharacterDB.characters["Player-1-A"] ~= WFM_CharacterDB.characters["Player-1-B"]')
        self.check('WFM_CharacterDB.current == "Player-1-B"')
        # Emulate SavedVariables restored before ADDON_LOADED in a new Lua session.
        preserved = self.lua.eval('WFM_CharacterDB.characters["Player-1-A"].bags.counts["200"]')
        self.lua.execute('frames = {}; timers = {}')
        self.lua.execute(SOURCE, "wfm-position-bridge")
        self.lua.execute('event("ADDON_LOADED", "wfm-position-bridge"); event("PLAYER_LOGIN"); advance(1)')
        self.assertEqual(self.lua.eval('WFM_CharacterDB.characters["Player-1-A"].bags.counts["200"]'), preserved)

    def test_logout_does_not_clear_captured_state(self):
        self.lua.execute('UnitLevel = function() return 0 end; event("PLAYER_LOGOUT")')
        self.check('WFM_CharacterDB.characters["Player-1-A"].level == 24')
        self.check('WFM_CharacterDB.savedAt == clock')

    def test_position_protocol_is_unchanged(self):
        self.lua.execute('tickers[1].fn()')
        self.check('#WFM == 8 and WFM[1] == 8642197531 and WFM[8] == 9753124682')
        self.check('WFM[2] == 2 and WFM[3] == 10 and WFM[4] == 20 and WFM[5] == 30 and WFM[6] == 0 and WFM[7] == 1426')

    def test_classic_api_fallbacks(self):
        self.lua.execute(r'''
            C_Container = nil; C_QuestLog = nil; C_TradeSkillUI = nil; GetProfessions = nil
            function GetContainerNumSlots(bag) return bag == 0 and 1 or 0 end
            function GetContainerItemInfo() return "icon", 9, false, 1, false, false, "link", false, false, 200 end
            function GetNumSkillLines() return 1 end
            function GetSkillLineInfo() return "Alchemy", false, false, 65, false, 0, 75 end
            function GetNumQuestLogEntries() return 1 end
            function GetQuestLogTitle() return "Classic quest", 20, nil, false, false, 1, 0, 450 end
            function GetNumQuestLeaderBoards() return 1 end
            function GetQuestLogLeaderBoard() return "Done", "monster", true end
            function GetQuestsCompleted(out) out[451] = true; out[452] = false end
            function GetTradeSkillLine() return "Alchemy", 65, 75 end
            function GetNumTradeSkills() return 1 end
            function GetTradeSkillInfo() return "Potion", "optimal" end
            function GetTradeSkillRecipeLink() return "|Henchant:777|h[Potion]|h" end
            event("PLAYER_LOGIN"); event("TRADE_SKILL_SHOW"); advance(1)
        ''')
        self.check('WFM_CharacterDB.characters["Player-1-A"].bags.counts["200"] == 9')
        self.check('WFM_CharacterDB.characters["Player-1-A"].skills.entries[1].skill == 65')
        self.check('WFM_CharacterDB.characters["Player-1-A"].quests.active["450"].ready == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].completedQuests.ids["451"] == true')
        self.check('WFM_CharacterDB.characters["Player-1-A"].completedQuests.ids["452"] == nil')
        self.check('WFM_CharacterDB.characters["Player-1-A"].recipes.Alchemy.learned["777"] == true')


class Lua54Tests(AddonTests):
    runtime_module = "lupa.lua54"


if __name__ == "__main__":
    unittest.main()
