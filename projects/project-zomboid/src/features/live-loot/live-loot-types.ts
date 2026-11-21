export interface LiveLootItem {
  id: string;
  count: number;
}

export interface LiveLootContainer {
  id: string;
  x: number;
  y: number;
  z: number;
  type: string;
  room: string;
  items: LiveLootItem[];
}

export interface LiveLootSnapshot {
  version: 1;
  sequence: number;
  updatedAt: number;
  receivedAt: number;
  containers: LiveLootContainer[];
}

export interface LocationLiveLootItem {
  id: string;
  name: string;
  count: number;
}

export interface LocationLiveLoot {
  containerCount: number;
  items: LocationLiveLootItem[];
}
