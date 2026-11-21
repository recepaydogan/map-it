using System;
using System.Collections.Generic;
using System.Text;

namespace OverwolfAccessProbe
{
    // Synthetic process image: only this byte array is mutated, never game memory.
    internal sealed class EngineMemoryFixture : ProcessMemory
    {
        private readonly byte[] module = new byte[131072], heap = new byte[8 * 1024 * 1024];
        private readonly long HeapBase;
        private int allocated, nextName, nextObject;
        private readonly int nameOffset, shift, vectorSize, bias;
        private readonly Dictionary<string, uint> names = new Dictionary<string, uint>();
        private readonly Dictionary<string, long> classes = new Dictionary<string, long>();
        private readonly Dictionary<string, long> fieldTypes = new Dictionary<string, long>();
        public readonly Dictionary<string, int> Offsets = new Dictionary<string, int>();
        public readonly Dictionary<string, long> Fields = new Dictionary<string, long>();
        private long nameData, chunk, corePackage, enginePackage, classClass;
        public long Engine, Instance, Local, Viewport, World, Level, Controller, Pawn, Root, OtherPawn, OtherRoot, PlayerArray;
        public bool FailReads;
        public long BlockedAddress;
        public Action<long> OnRead;

        public EngineMemoryFixture(bool wide, bool compact, bool varied) : this(wide, compact, varied, 0) { }
        public EngineMemoryFixture(bool wide, bool compact, bool varied, long relocation)
        {
            HeapBase = 0x200000000L + relocation;
            ModuleBase = 0x140000000L + relocation; ModuleEnd = ModuleBase + module.Length;
            ImageKey = new string('a', 64);
            nameOffset = compact ? 32 : 40; shift = varied ? 1 : 6; vectorSize = wide ? 24 : 12; bias = varied ? 64 : 0;
            nameData = Allocate(131072);
            Name("None"); Name("ByteProperty"); Name("IntProperty"); Name("ObjectProperty");
            Int(ModuleBase + 0x2000, 0); Long(ModuleBase + 0x2008, nameData);
            long chunks = Allocate(8); chunk = Allocate(65536 * 24); Long(chunks, chunk);
            Long(ModuleBase + 0x4000, chunks); Int(ModuleBase + 0x4010, 65536); Int(ModuleBase + 0x4014, 64);
            Int(ModuleBase + 0x4018, 1); Int(ModuleBase + 0x401c, 1);
            // Bootstrap class/package objects before their class pointers exist.
            corePackage = Object("/Script/CoreUObject", 0, 0); enginePackage = Object("/Script/Engine", 0, 0);
            classClass = Object("Class", 0, corePackage);
            Long(corePackage + 16, classClass); Long(enginePackage + 16, classClass); Long(classClass + 16, classClass);
            AddClass("Object", null); AddClass("Actor", "Object"); AddClass("ActorComponent", "Object");
            AddClass("SceneComponent", "ActorComponent"); AddClass("Pawn", "Actor"); AddClass("Controller", "Actor");
            AddClass("PlayerController", "Controller"); AddClass("Player", "Object"); AddClass("LocalPlayer", "Player");
            AddClass("GameInstance", "Object"); AddClass("World", "Object"); AddClass("GameViewportClient", "Object");
            AddClass("Engine", "Object"); AddClass("GameEngine", "Engine");
            AddClass("TestCharacter", "Pawn"); AddClass("TestGameInstance", "GameInstance"); AddClass("TestController", "PlayerController");
            Field("Engine", "GameViewport", "ObjectProperty", 0x110, 8);
            Field("GameInstance", "LocalPlayers", "ArrayProperty", 0x100, 16);
            Field("Player", "PlayerController", "ObjectProperty", 0x180, 8);
            Field("LocalPlayer", "ViewportClient", "ObjectProperty", 0x190, 8);
            Field("GameViewportClient", "World", "ObjectProperty", 0x120, 8);
            Field("World", "OwningGameInstance", "ObjectProperty", 0x140, 8);
            Field("PlayerController", "Player", "ObjectProperty", 0x280, 8);
            Field("PlayerController", "AcknowledgedPawn", "ObjectProperty", 0x288, 8);
            Field("Controller", "Pawn", "ObjectProperty", 0x260, 8);
            Field("Pawn", "Controller", "ObjectProperty", 0x200, 8);
            Field("Actor", "RootComponent", "ObjectProperty", 0x180, 8);
            Field("SceneComponent", "RelativeLocation", "StructProperty", 0x1a0, vectorSize);
            Field("SceneComponent", "AttachParent", "ObjectProperty", 0x180, 8);
            Engine = InstanceOf("GameEngine", enginePackage);
            Instance = InstanceOf("TestGameInstance", enginePackage); Local = InstanceOf("LocalPlayer", Engine);
            Viewport = InstanceOf("GameViewportClient", enginePackage); World = InstanceOf("World", enginePackage);
            Level = InstanceOf("Object", World); Controller = InstanceOf("TestController", Level);
            OtherPawn = InstanceOf("Pawn", Level); OtherRoot = InstanceOf("SceneComponent", OtherPawn);
            Pawn = InstanceOf("TestCharacter", Level); Root = InstanceOf("SceneComponent", Pawn);
            PlayerArray = Allocate(16); Long(PlayerArray, Local);
            Set(Engine, "Engine.GameViewport", Viewport);
            Long(Instance + Offsets["GameInstance.LocalPlayers"], PlayerArray);
            Int(Instance + Offsets["GameInstance.LocalPlayers"] + 8, 1); Int(Instance + Offsets["GameInstance.LocalPlayers"] + 12, 2);
            Set(Local, "LocalPlayer.ViewportClient", Viewport); Set(Viewport, "GameViewportClient.World", World);
            Set(World, "World.OwningGameInstance", Instance); Set(Local, "Player.PlayerController", Controller);
            Set(Controller, "PlayerController.Player", Local); Possess(Pawn, Root);
            Set(OtherPawn, "Actor.RootComponent", OtherRoot); Position(OtherRoot, 9999, 8888, 77); Position(Root, 1200, -2300, 450);
            while (nextObject < 64) InstanceOf("Object", enginePackage);
        }
        public long Allocate(int size) { long address = HeapBase + allocated; allocated = (allocated + size + 15) & ~15; return address; }
        private uint Name(string name)
        {
            uint index; if (names.TryGetValue(name, out index)) return index;
            index = (uint)(nextName / 2); names[name] = index;
            Write(nameData + nextName, BitConverter.GetBytes((ushort)(name.Length << shift)));
            Write(nameData + nextName + 2, Encoding.ASCII.GetBytes(name)); nextName = (nextName + name.Length + 3) & ~1;
            Int(ModuleBase + 0x2004, nextName); return index;
        }
        private long Object(string name, long cls, long outer)
        {
            long address = Allocate(2048); int index = nextObject++;
            Long(address, ModuleBase + 0x100); Int(address + 12, index); Long(address + 16, cls);
            Int(address + 24, (int)Name(name)); Long(address + 32, outer);
            Long(chunk + index * 24L, address); Int(chunk + index * 24L + 16, index + 1);
            if (nextObject > 64) Int(ModuleBase + 0x4014, nextObject);
            return address;
        }
        private void AddClass(string name, string parent)
        {
            long cls = Object(name, classClass, name == "Object" ? corePackage : enginePackage); classes[name] = cls;
            Long(cls + 0x40, parent == null ? 0 : classes[parent]); Int(cls + 0x58, 2048);
        }
        public long InstanceOf(string cls, long outer) { return Object("Fixture", classes[cls], outer); }
        public int ObjectIndex(long obj) { return BitConverter.ToInt32(ReadRaw(obj + 12, 4), 0); }
        public void AddDistractors(int count)
        {
            for (int i = 0; i < count; i++) {
                long obj = Allocate(48); int index = nextObject++;
                Long(obj, ModuleBase + 0x100); Int(obj + 12, index); Long(obj + 16, classes["Object"]);
                Long(chunk + index * 24L, obj); Int(chunk + index * 24L + 16, index + 1);
            }
            Int(ModuleBase + 0x4014, nextObject);
        }
        private void Field(string cls, string name, string type, int offset, int size)
        {
            long kind;
            if (!fieldTypes.TryGetValue(type, out kind)) { kind = Allocate(32); Int(kind, (int)Name(type)); fieldTypes[type] = kind; }
            long field = Allocate(128), owner = classes[cls];
            Long(field, ModuleBase + 0x100); Long(field + 8, kind); Long(field + 16, owner | 1L);
            Long(field + nameOffset - 8, ReadLong(owner + 0x50)); Int(field + nameOffset, (int)Name(name));
            Int(field + nameOffset + 16, 1); Int(field + nameOffset + 20, size); Int(field + nameOffset + 36, offset + bias);
            Long(owner + 0x50, field); Offsets[cls + "." + name] = offset + bias; Fields[cls + "." + name] = field;
        }
        public void Set(long obj, string member, long value) { Long(obj + Offsets[member], value); }
        public void Possess(long pawn, long root)
        {
            Set(Controller, "Controller.Pawn", pawn); Set(Controller, "PlayerController.AcknowledgedPawn", pawn);
            if (pawn != 0) { Set(pawn, "Pawn.Controller", Controller); Set(pawn, "Actor.RootComponent", root); }
        }
        public void Position(long root, double x, double y, double z)
        {
            int offset = Offsets["SceneComponent.RelativeLocation"]; double[] point = { x, y, z };
            for (int i = 0; i < 3; i++) Write(root + offset + i * (vectorSize / 3), vectorSize == 24 ? BitConverter.GetBytes(point[i]) : BitConverter.GetBytes((float)point[i]));
        }
        public void BreakField(string key) { Int(Fields[key] + nameOffset, (int)Name("MissingField")); }
        public void RecycleSerial(long obj) { int index = BitConverter.ToInt32(ReadRaw(obj + 12, 4), 0); Int(chunk + index * 24L + 16, 7777); }
        public void Int(long address, int value) { Write(address, BitConverter.GetBytes(value)); }
        public void Long(long address, long value) { Write(address, BitConverter.GetBytes(value)); }
        private long ReadLong(long address) { return BitConverter.ToInt64(ReadRaw(address, 8), 0); }
        private byte[] ReadRaw(long address, int size) { byte[] value = new byte[size]; ReadCore(address, value); return value; }
        private void Write(long address, byte[] data)
        {
            if (address >= ModuleBase && address + data.Length <= ModuleEnd) Array.Copy(data, 0, module, address - ModuleBase, data.Length);
            else Array.Copy(data, 0, heap, address - HeapBase, data.Length);
        }
        protected override bool ReadCore(long address, byte[] data)
        {
            if (OnRead != null) OnRead(address);
            if (FailReads || (BlockedAddress != 0 && address <= BlockedAddress && address + data.Length > BlockedAddress)) return false;
            if (address >= ModuleBase && address + data.Length <= ModuleEnd) { Array.Copy(module, address - ModuleBase, data, 0, data.Length); return true; }
            if (address >= HeapBase && address + data.Length <= HeapBase + heap.Length) { Array.Copy(heap, address - HeapBase, data, 0, data.Length); return true; }
            return false;
        }
        public override bool Query(long address, out MemoryRegion region)
        {
            region = new MemoryRegion { Start = ModuleBase, End = ModuleEnd, Readable = true, Writable = true };
            return address >= ModuleBase && address < ModuleEnd;
        }
        public override void Dispose() { }
    }
}
