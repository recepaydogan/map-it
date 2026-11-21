using System;
using System.IO;
using System.Text;

namespace EldenRingAtlas
{
    // PC SL2 layout references and attribution are documented in README.md.
    internal sealed class SlotParser
    {
        private readonly byte[] data;
        private int offset;
        private SlotParser(byte[] bytes) { data = bytes; }

        private void Skip(int count)
        {
            if (count < 0 || count > data.Length - offset)
                throw new InvalidDataException("Truncated or unsupported character layout.");
            offset += count;
        }
        private uint UInt()
        {
            int start = offset;
            Skip(4);
            return BitConverter.ToUInt32(data, start);
        }
        private void Array(int stride, int limit)
        {
            uint count = UInt();
            if (count > limit) throw new InvalidDataException("Invalid array length.");
            Skip(checked((int)count * stride));
        }
        private void Block()
        {
            uint length = UInt();
            if (length > data.Length) throw new InvalidDataException("Invalid block length.");
            Skip((int)length);
        }
        private int[] Map()
        {
            int start = offset;
            Skip(4);
            return new[] { (int)data[start + 3], data[start + 2], data[start + 1], data[start] };
        }
        private float Float()
        {
            int start = offset;
            Skip(4);
            float value = BitConverter.ToSingle(data, start);
            if (float.IsNaN(value) || float.IsInfinity(value) || Math.Abs(value) > 1000000)
                throw new InvalidDataException("Invalid saved coordinate.");
            return value;
        }

        internal static SavePosition Read(byte[] bytes)
        {
            var reader = new SlotParser(bytes);
            var position = new SavePosition();
            position.version = (int)reader.UInt();
            if (position.version == 0) return null;
            if (position.version < 65 || position.version > 262)
                throw new InvalidDataException("Unsupported save version: " + position.version);
            position.headerMap = reader.Map();
            reader.Skip(24);
            int items = position.version <= 81 ? 5118 : 5120;
            for (int i = 0; i < items; i++)
            {
                uint handle = reader.UInt();
                reader.Skip(4);
                uint type = handle & 0xF0000000;
                if (handle != 0 && type != 0xC0000000)
                    reader.Skip(type == 0x80000000 ? 13 : 8);
            }
            int playerStart = reader.offset;
            reader.Skip(0x1B0);
            position.name = Encoding.Unicode.GetString(bytes, playerStart + 0x94, 32).TrimEnd('\0');
            reader.Skip(13 * 16); // Special effects.
            reader.Skip(0x58 + 0x1C + 0x58 + 0x58); // Equipped slots.
            reader.Skip(16 + (0xA80 + 0x180) * 12); // Held inventory.
            reader.Skip(0x74 + 0x8C + 0x18); // Spells, quick items, gestures.
            reader.Array(8, 256); // Acquired projectiles.
            reader.Skip(0x9C + 0x0C + 0x12F); // Armaments, physick, appearance.
            reader.Skip(16 + (0x780 + 0x80) * 12); // Storage inventory.
            reader.Skip(0x100); // Gestures.
            reader.Array(4, 1024); // Unlocked regions.
            reader.Skip(0x28 + 1 + 0x44 + 8); // Torrent and bloodstain.
            reader.Skip(4); reader.Block(); // Menu save/load.
            reader.Skip(0x34 + 8 + 7000 * 16); // Trophies and item state.
            reader.Skip(4); reader.Block(); // Tutorials.
            reader.Skip(3 + 4 + 4 + 1 + 4 + 4 + 1 + 4 + 4);
            reader.Skip(0x1BF99F + 1); // Event flags and terminator.
            for (int i = 0; i < 5; i++) reader.Block(); // World state blocks.
            position.x = reader.Float();
            position.y = reader.Float();
            position.z = reader.Float();
            position.map = reader.Map();
            if (position.map[0] < 10 || position.map[0] > 61)
                throw new InvalidDataException("Invalid saved map ID.");
            return position;
        }
    }
}
