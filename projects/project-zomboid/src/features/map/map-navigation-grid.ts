import { gunzipSync } from "fflate";
import {
  parseMapNavigationManifest,
  type MapNavigationManifest,
} from "./map-navigation-format.ts";

const cellKey = (x: number, y: number) => `${x},${y}`;
const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const NAVIGATION_CACHE_VERSION = "3";
const navigationResourceUrl = (url: string) =>
  `${url}${url.includes("?") ? "&" : "?"}v=${NAVIGATION_CACHE_VERSION}`;

interface NavigationCellLocation {
  path: string;
  offset: number;
  length: number;
}

export interface MapNavigationGrid {
  readonly manifest: MapNavigationManifest;
  readonly coarseNavigation: Uint8Array;
  ensureNeighborhood(x: number, y: number): Promise<void> | null;
  getSquare(x: number, y: number): number | null;
}

export class HostedMapNavigationGrid implements MapNavigationGrid {
  readonly manifest: MapNavigationManifest;
  readonly coarseNavigation: Uint8Array;
  private readonly baseUrl: string;
  private readonly cellLocations = new Map<string, NavigationCellLocation>();
  private readonly regionPayloads = new Map<string, Uint8Array>();
  private readonly pendingRegions = new Map<string, Promise<Uint8Array>>();
  private readonly cells = new Map<string, Uint8Array | null>();
  private readonly pendingCells = new Map<string, Promise<void>>();

  private constructor(baseUrl: string, manifest: MapNavigationManifest, coarseNavigation: Uint8Array) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.manifest = manifest;
    this.coarseNavigation = coarseNavigation;
    for (const region of manifest.regions) {
      for (const [x, y, offset, length] of region.cells) {
        const key = cellKey(x, y);
        if (this.cellLocations.has(key)) throw new Error(`Map navigation cell ${key} is duplicated.`);
        this.cellLocations.set(key, { path: region.path, offset, length });
      }
    }
  }

  static async load(baseUrl: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const response = await fetch(navigationResourceUrl(`${normalizedBaseUrl}/manifest.json`));
    if (!response.ok) throw new Error(`Map navigation manifest request failed with status ${response.status}.`);
    const manifest = parseMapNavigationManifest(await response.json());
    const coarseResponse = await fetch(navigationResourceUrl(
      `${normalizedBaseUrl}/${manifest.coarse.path.replace(/^\/+/, "")}`,
    ));
    if (!coarseResponse.ok) {
      throw new Error(`Coarse map navigation request failed with status ${coarseResponse.status}.`);
    }
    const coarsePayload = new Uint8Array(await coarseResponse.arrayBuffer());
    const expectedLength = manifest.coarse.width * manifest.coarse.height;
    const coarseNavigation = coarsePayload.length === expectedLength
      ? coarsePayload
      : gunzipSync(coarsePayload);
    if (coarseNavigation.length !== expectedLength) {
      throw new Error(`Coarse map navigation has ${coarseNavigation.length} bytes; expected ${expectedLength}.`);
    }
    return new HostedMapNavigationGrid(normalizedBaseUrl, manifest, coarseNavigation);
  }

  private loadRegion(path: string) {
    const loaded = this.regionPayloads.get(path);
    if (loaded) return Promise.resolve(loaded);
    const pending = this.pendingRegions.get(path);
    if (pending) return pending;
    const request = fetch(navigationResourceUrl(`${this.baseUrl}/${path.replace(/^\/+/, "")}`))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Map navigation region request failed with status ${response.status}.`);
        const payload = new Uint8Array(await response.arrayBuffer());
        this.regionPayloads.set(path, payload);
        return payload;
      })
      .finally(() => this.pendingRegions.delete(path));
    this.pendingRegions.set(path, request);
    return request;
  }

  private loadCell(cellX: number, cellY: number) {
    const key = cellKey(cellX, cellY);
    if (this.cells.has(key)) return null;
    const pending = this.pendingCells.get(key);
    if (pending) return pending;
    const location = this.cellLocations.get(key);
    if (!location) {
      this.cells.set(key, null);
      return null;
    }

    const request = this.loadRegion(location.path)
      .then((regionPayload) => {
        if (location.offset + location.length > regionPayload.length) {
          throw new Error(`Map navigation cell ${key} points outside its region payload.`);
        }
        const compressed = regionPayload.subarray(location.offset, location.offset + location.length);
        const expectedLength = this.manifest.cellSize ** 2;
        const cell = gunzipSync(compressed);
        if (cell.length !== expectedLength) {
          throw new Error(`Map navigation cell ${key} has ${cell.length} bytes; expected ${expectedLength}.`);
        }
        this.cells.set(key, cell);
      })
      .finally(() => this.pendingCells.delete(key));
    this.pendingCells.set(key, request);
    return request;
  }

  ensureNeighborhood(x: number, y: number) {
    const size = this.manifest.cellSize;
    const cellX = Math.floor(x / size);
    const cellY = Math.floor(y / size);
    const localX = positiveModulo(x, size);
    const localY = positiveModulo(y, size);
    const coordinates: [number, number][] = [[cellX, cellY]];
    if (localX === 0) coordinates.push([cellX - 1, cellY]);
    if (localX === size - 1) coordinates.push([cellX + 1, cellY]);
    if (localY === 0) coordinates.push([cellX, cellY - 1]);
    if (localY === size - 1) coordinates.push([cellX, cellY + 1]);
    const requests = coordinates.flatMap(([nextX, nextY]) => {
      const request = this.loadCell(nextX, nextY);
      return request ? [request] : [];
    });
    return requests.length > 0 ? Promise.all(requests).then(() => undefined) : null;
  }

  getSquare(x: number, y: number) {
    const size = this.manifest.cellSize;
    const cellX = Math.floor(x / size);
    const cellY = Math.floor(y / size);
    const cell = this.cells.get(cellKey(cellX, cellY));
    if (!cell) return null;
    const localX = positiveModulo(x, size);
    const localY = positiveModulo(y, size);
    return cell[localY * size + localX] ?? null;
  }

  coversSquare(x: number, y: number) {
    const size = this.manifest.cellSize;
    return this.cellLocations.has(cellKey(Math.floor(x / size), Math.floor(y / size)));
  }
}

export class CompositeMapNavigationGrid implements MapNavigationGrid {
  readonly manifest: MapNavigationManifest;
  readonly coarseNavigation: Uint8Array;
  private readonly base: HostedMapNavigationGrid;
  private readonly overlays: HostedMapNavigationGrid[];

  constructor(base: HostedMapNavigationGrid, overlays: HostedMapNavigationGrid[]) {
    this.base = base;
    this.overlays = overlays;
    this.manifest = base.manifest;
    this.coarseNavigation = new Uint8Array(base.coarseNavigation);
    const baseCoarse = base.manifest.coarse;
    for (const overlay of [...overlays].reverse()) {
      const source = overlay.manifest.coarse;
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const worldX = source.minX + (x + 0.5) * source.scale;
          const worldY = source.minY + (y + 0.5) * source.scale;
          if (!overlay.coversSquare(worldX, worldY)) continue;
          const targetX = Math.floor((worldX - baseCoarse.minX) / baseCoarse.scale);
          const targetY = Math.floor((worldY - baseCoarse.minY) / baseCoarse.scale);
          if (targetX < 0 || targetX >= baseCoarse.width || targetY < 0 || targetY >= baseCoarse.height) continue;
          this.coarseNavigation[targetY * baseCoarse.width + targetX] =
            overlay.coarseNavigation[y * source.width + x]!;
        }
      }
    }
  }

  ensureNeighborhood(x: number, y: number) {
    const requests = [
      this.base.ensureNeighborhood(x, y),
      ...this.overlays.map((overlay) => overlay.ensureNeighborhood(x, y)),
    ].filter((request) => request !== null);
    return requests.length > 0 ? Promise.all(requests).then(() => undefined) : null;
  }

  getSquare(x: number, y: number) {
    const overlay = this.overlays.find((candidate) => candidate.coversSquare(x, y));
    return (overlay ?? this.base).getSquare(x, y);
  }
}
