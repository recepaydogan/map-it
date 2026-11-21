--- The snapshot remains for old app builds and liveness checks. Current builds
--- consume the append-only stream below without polling the filesystem.
local POSITION_FILE = "PZInteractiveMap/position.txt"
local POSITION_STREAM_FILES = {
    "PZInteractiveMap/position-stream-a.txt",
    "PZInteractiveMap/position-stream-b.txt",
}
local POSITION_STREAM_NAMES = { "position-stream-a.txt", "position-stream-b.txt" }
local LOOT_FILE = "PZInteractiveMap/loot-snapshot.json"
local GAME_SESSION_FILE = "PZInteractiveMap/game-session.json"
local POSITION_WRITE_INTERVAL_MS = 50
local POSITION_SNAPSHOT_INTERVAL_MS = 500
local POSITION_STREAM_ROTATE_LINES = 200
local GAME_SESSION_WRITE_INTERVAL_MS = 5000
local LOOT_SCAN_RADIUS = 12
--- Loot discovery runs on Project Zomboid's game thread. Scanning the former
--- 25x25 area in one OnTick blocked position sampling and the overlay together.
--- Keep each slice deliberately tiny so position writes always get priority.
local LOOT_SCAN_SQUARES_PER_TICK = 4
local LOOT_SCAN_MOVE_DISTANCE = 6

local lastPositionWriteAt = 0
local lastPositionSnapshotAt = 0
local positionStreamIndex = 1
local positionStreamLines = 0
local lastGameSessionWriteAt = 0
local positionSequence = 0
local lootSequence = 0
local knownContainers = {}
local lootDirty = true
local forceLootScan = true
local lootScan = nil
local lastLootScanX = nil
local lastLootScanY = nil
local lastLootScanZ = nil
local gameSessionWritten = false

print("[PZInteractiveMapBridge] loaded")

local function escapeJson(value)
    local escaped = tostring(value or "")
    escaped = escaped:gsub("\\", "\\\\")
    escaped = escaped:gsub('"', '\\"')
    escaped = escaped:gsub("\b", "\\b")
    escaped = escaped:gsub("\f", "\\f")
    escaped = escaped:gsub("\n", "\\n")
    escaped = escaped:gsub("\r", "\\r")
    escaped = escaped:gsub("\t", "\\t")
    return '"' .. escaped .. '"'
end

local function writeGameSession(now)
    local modIds = {}
    local activeMods = getActivatedMods()
    if activeMods then
        for index = 0, activeMods:size() - 1 do
            table.insert(modIds, escapeJson(activeMods:get(index)))
        end
    end

    local mapFolders = {}
    local world = getWorld()
    local worldMap = world and world:getMap() or "DEFAULT"
    if worldMap == "DEFAULT" then
        worldMap = "Muldraugh, KY"
    end
    for mapFolder in string.gmatch(worldMap, "([^;]+)") do
        local normalized = mapFolder:match("^%s*(.-)%s*$")
        if normalized and normalized ~= "" then
            table.insert(mapFolders, escapeJson(normalized))
        end
    end

    local writer = getFileWriter(GAME_SESSION_FILE, true, false)
    if not writer then
        return
    end
    writer:write(table.concat({
        '{"version":1,"updatedAt":', string.format("%.0f", now),
        ',"modIds":[', table.concat(modIds, ","),
        '],"mapFolders":[', table.concat(mapFolders, ","), "]}"
    }))
    writer:close()
    if not gameSessionWritten then
        gameSessionWritten = true
        print("[PZInteractiveMapBridge] game session written: " .. worldMap)
    end
end

--- The unit vector the character faces, in world axes (+x east, +y south).
--- Wrapped in pcall so a build without getForwardDirection degrades to "no
--- facing" instead of erroring on every tick and killing position writes.
local function readFacing(player)
    local ok, x, y = pcall(function()
        local forward = player:getForwardDirection()
        if not forward then
            return nil, nil
        end
        return forward:getX(), forward:getY()
    end)
    if ok and type(x) == "number" and type(y) == "number" then
        return x, y
    end
    return 0, 0
end

local function writeLocalPlayerPosition(now, player)
    if now - lastPositionWriteAt < POSITION_WRITE_INTERVAL_MS then
        return
    end
    lastPositionWriteAt = now

    positionSequence = positionSequence + 1
    local facingX, facingY = readFacing(player)
    local payload = string.format(
        '{"version":1,"sequence":%d,"updatedAt":%.0f,"x":%.3f,"y":%.3f,"z":%.3f,"dx":%.4f,"dy":%.4f}',
        positionSequence,
        now,
        player:getX(),
        player:getY(),
        player:getZ(),
        facingX,
        facingY
    )

    -- Overwolf tails this append-only file through listenOnFile. Rotating to a
    -- sibling avoids truncating the file underneath an active listener.
    local streamWriter = getFileWriter(POSITION_STREAM_FILES[positionStreamIndex], true, true)
    if streamWriter then
        streamWriter:write(payload .. "\n")
        positionStreamLines = positionStreamLines + 1
        if positionStreamLines >= POSITION_STREAM_ROTATE_LINES then
            local nextIndex = positionStreamIndex == 1 and 2 or 1
            streamWriter:write('{"version":1,"rotate":"' .. POSITION_STREAM_NAMES[nextIndex] .. '"}\n')
            streamWriter:close()

            local nextWriter = getFileWriter(POSITION_STREAM_FILES[nextIndex], true, false)
            if nextWriter then
                nextWriter:write("")
                nextWriter:close()
            end
            positionStreamIndex = nextIndex
            positionStreamLines = 0
        else
            streamWriter:close()
        end
    end

    if now - lastPositionSnapshotAt >= POSITION_SNAPSHOT_INTERVAL_MS then
        lastPositionSnapshotAt = now
        local writer = getFileWriter(POSITION_FILE, true, false)
        if writer then
            writer:write(payload)
            writer:close()
        end
    end

    if positionSequence == 1 then
        print("[PZInteractiveMapBridge] first position written")
    end
end

local function getContainerState(square, objectIndex, containerIndex, container)
    local counts = {}
    local items = container:getItems()
    for itemIndex = 0, items:size() - 1 do
        local item = items:get(itemIndex)
        if item then
            local itemId = item:getFullType()
            counts[itemId] = (counts[itemId] or 0) + 1
        end
    end

    local itemIds = {}
    for itemId in pairs(counts) do
        table.insert(itemIds, itemId)
    end
    table.sort(itemIds)

    local itemPayloads = {}
    local signatureParts = {}
    for _, itemId in ipairs(itemIds) do
        local count = counts[itemId]
        table.insert(itemPayloads, '{"id":' .. escapeJson(itemId) .. ',"count":' .. tostring(count) .. '}')
        table.insert(signatureParts, itemId .. ":" .. tostring(count))
    end

    local room = square:getRoom()
    local roomName = room and room:getName() or ""
    local containerType = container:getType() or ""
    local x = square:getX()
    local y = square:getY()
    local z = square:getZ()
    local id = table.concat({ x, y, z, objectIndex, containerIndex, containerType }, ":")
    local payload = table.concat({
        '{"id":', escapeJson(id),
        ',"x":', tostring(x),
        ',"y":', tostring(y),
        ',"z":', tostring(z),
        ',"type":', escapeJson(containerType),
        ',"room":', escapeJson(roomName),
        ',"items":[', table.concat(itemPayloads, ","), "]}"
    })
    local signature = table.concat({ containerType, roomName, table.concat(signatureParts, "|") }, "#")
    return id, payload, signature
end

local function scanSquare(square)
    if not square then
        return
    end

    local objects = square:getObjects()
    for objectIndex = 0, objects:size() - 1 do
        local object = objects:get(objectIndex)
        if object then
            for containerIndex = 0, object:getContainerCount() - 1 do
                local container = object:getContainerByIndex(containerIndex)
                if container and container:isExplored() then
                    local id, payload, signature = getContainerState(
                        square,
                        objectIndex,
                        containerIndex,
                        container
                    )
                    local previous = knownContainers[id]
                    if not previous or previous.signature ~= signature then
                        knownContainers[id] = { payload = payload, signature = signature }
                        lootDirty = true
                    end
                end
            end
        end
    end
end

local function shouldStartLootScan(playerX, playerY, playerZ)
    if forceLootScan or lastLootScanX == nil then
        return true
    end
    if playerZ ~= lastLootScanZ then
        return true
    end
    return math.abs(playerX - lastLootScanX) >= LOOT_SCAN_MOVE_DISTANCE
        or math.abs(playerY - lastLootScanY) >= LOOT_SCAN_MOVE_DISTANCE
end

local function startLootScan(player)
    local playerX = math.floor(player:getX())
    local playerY = math.floor(player:getY())
    local playerZ = math.floor(player:getZ())
    if not shouldStartLootScan(playerX, playerY, playerZ) then
        return false
    end
    forceLootScan = false
    lootScan = {
        centerX = playerX,
        centerY = playerY,
        z = playerZ,
        x = playerX - LOOT_SCAN_RADIUS,
        y = playerY - LOOT_SCAN_RADIUS,
        maxX = playerX + LOOT_SCAN_RADIUS,
        maxY = playerY + LOOT_SCAN_RADIUS,
    }
    return true
end

local function advanceLootScan(scan)
    scan.y = scan.y + 1
    if scan.y <= scan.maxY then
        return false
    end
    scan.y = scan.centerY - LOOT_SCAN_RADIUS
    scan.x = scan.x + 1
    return scan.x > scan.maxX
end

local function scanNearbyLoot(player)
    if not lootScan and not startLootScan(player) then
        return
    end

    local cell = getCell()
    for _ = 1, LOOT_SCAN_SQUARES_PER_TICK do
        local scan = lootScan
        if not scan then
            return
        end
        scanSquare(cell:getGridSquare(scan.x, scan.y, scan.z))
        if advanceLootScan(scan) then
            lastLootScanX = scan.centerX
            lastLootScanY = scan.centerY
            lastLootScanZ = scan.z
            lootScan = nil
            return
        end
    end
end

local function writeLootSnapshot(now)
    -- Publish once after the complete scan. Writing a growing JSON snapshot on
    -- every slice would replace one game-thread bottleneck with another.
    if lootScan or not lootDirty then
        return
    end

    local ids = {}
    for id in pairs(knownContainers) do
        table.insert(ids, id)
    end
    table.sort(ids)

    local containers = {}
    for _, id in ipairs(ids) do
        table.insert(containers, knownContainers[id].payload)
    end

    local writer = getFileWriter(LOOT_FILE, true, false)
    if not writer then
        return
    end

    lootSequence = lootSequence + 1
    local payload = table.concat({
        '{"version":1,"sequence":', tostring(lootSequence),
        ',"updatedAt":', string.format("%.0f", now),
        ',"containers":[', table.concat(containers, ","), "]}"
    })
    writer:write(payload)
    writer:close()
    lootDirty = false
end

local function resetBridgeState()
    for index = 1, #POSITION_STREAM_FILES do
        local streamWriter = getFileWriter(POSITION_STREAM_FILES[index], true, false)
        if streamWriter then
            streamWriter:write("")
            streamWriter:close()
        end
    end
    positionStreamIndex = 1
    positionStreamLines = 0

    knownContainers = {}
    lootSequence = 0
    lootDirty = true
    forceLootScan = true
    lootScan = nil
    lastLootScanX = nil
    lastLootScanY = nil
    lastLootScanZ = nil
    local now = getTimestampMs()
    lastGameSessionWriteAt = now
    writeGameSession(now)
    writeLootSnapshot(now)
end

local function updateBridge()
    local player = getPlayer()
    if not player or player:isDead() then
        return
    end

    local now = getTimestampMs()
    if now - lastGameSessionWriteAt >= GAME_SESSION_WRITE_INTERVAL_MS then
        lastGameSessionWriteAt = now
        writeGameSession(now)
    end
    writeLocalPlayerPosition(now, player)
    scanNearbyLoot(player)
    writeLootSnapshot(now)
end

local function requestLootRefresh()
    forceLootScan = true
end

Events.OnGameStart.Add(resetBridgeState)
Events.OnContainerUpdate.Add(requestLootRefresh)
Events.OnTick.Add(updateBridge)
