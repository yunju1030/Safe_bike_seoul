import type { Point } from "./demo-data";

export type Incident = {
  id: string;
  name: string;
  area: string;
  count: number | null;
  point: Point;
};

export const routeProximityMeters = 200;

export function distanceFromRoute(point: Point, path: readonly Point[]) {
  const metersPerDegree = Math.PI * 6_371_000 / 180;
  const longitudeScale = metersPerDegree * Math.cos(point[0] * Math.PI / 180);
  const project = ([lat, lng]: Point) => [
    (lng - point[1]) * longitudeScale,
    (lat - point[0]) * metersPerDegree,
  ] as const;
  let nearest = Infinity;
  for (let index = 1; index < path.length; index++) {
    const [ax, ay] = project(path[index - 1]);
    const [bx, by] = project(path[index]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + fraction * dx, ay + fraction * dy));
  }
  return nearest;
}
