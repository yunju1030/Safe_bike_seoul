export type Station = {
  id: string;
  name: string;
  bikes: number | null;
  point: [number, number];
};

export type NearbyStation = Station & { distanceMeters: number };
