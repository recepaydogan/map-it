-- Keep the numeric array allocated so the companion can read stable slots.
-- Protocol: marker, sequence, world X/Y/Z, world map, UI map, end marker.
if WFT then WFT:Cancel() end
WFM = { 8642197531, 0, 0, 0, 0, 0, 0, 9753124682 }
local bridge = WFM

local function IsPublicNumber(value)
    if issecretvalue and issecretvalue(value) then return false end
    return type(value) == "number"
end

local function Publish()
    local x, y, z, worldMapID = UnitPosition("player")
    local uiMapID = C_Map.GetBestMapForUnit("player")
    if not (IsPublicNumber(x) and IsPublicNumber(y) and IsPublicNumber(z)
        and IsPublicNumber(worldMapID) and IsPublicNumber(uiMapID)) then
        return
    end
    bridge[2] = bridge[2] + 1
    bridge[3], bridge[4], bridge[5], bridge[6] = x, y, z, worldMapID
    bridge[7] = uiMapID
    bridge[2] = bridge[2] + 1
end

WFT = C_Timer.NewTicker(0.2, function() pcall(Publish) end)
