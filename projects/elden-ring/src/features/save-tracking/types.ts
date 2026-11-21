export interface SavedCharacter {
  id: string;
  name: string;
  slot: number;
  version: number;
  map: number[];
  headerMap: number[];
  x: number;
  y: number;
  z: number;
  savedAt: number;
  checksum: string;
}

export interface SaveReaderResult {
  state: "ready" | "no-save" | "retry" | "error";
  characters?: SavedCharacter[];
  activeId?: string | null;
  error?: string;
}

export interface SaveReaderPlugin {
  Read: (callback: (json: string) => void) => void;
}
