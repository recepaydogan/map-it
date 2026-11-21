export type LandmarkStatus = "confirmed" | "unconfirmed" | "unknown";
export interface MapLandmark {
  id: string;
  inGameAddress: string;
  realWorldAddress: string;
  gameCoordinates?: { x: number; y: number };
  realWorldCoordinates?: { latitude: number; longitude: number };
  gamePhoto?: string;
  description?: string;
  tags: string[];
  sourceCategory?: string;
  nameStatus: LandmarkStatus;
  positionStatus: LandmarkStatus;
  realWorldStatus: LandmarkStatus;
  streetAddressKnown: boolean;
  classified: boolean;
  lastEdited?: string;
}
export interface LandmarkRecord {
  id: string;
  name: string;
  category: string;
  landmark: MapLandmark;
}
