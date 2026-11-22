import type { Point } from "./geo";
import { distanceFromRoute } from "./bicycle-route";

export type Incident = {
  id: string;
  name: string;
  area: string;
  count: number | null;
  casualties: number | null;
  fatal: number | null;
  serious: number | null;
  minor: number | null;
  reported: number | null;
  point: Point;
};

export const incidentRadiusMeters = 150;

export function incidentsNearRoute(incidents: Incident[], path: readonly Point[]) {
  const matches = new Map<string, { incident: Incident; distance: number }>();
  for (const incident of incidents) {
    const distance = distanceFromRoute(incident.point, path);
    if (distance <= incidentRadiusMeters && distance < (matches.get(incident.id)?.distance ?? Infinity)) {
      matches.set(incident.id, { incident, distance });
    }
  }
  return [...matches.values()].sort((a, b) => a.distance - b.distance);
}
