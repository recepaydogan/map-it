using System;

namespace EldenRingAtlas
{
    public sealed class SavePosition
    {
        public string id;
        public string name;
        public int slot;
        public int version;
        public int[] map;
        public int[] headerMap;
        public float x;
        public float y;
        public float z;
        public double savedAt;
        public string checksum;
    }
}
