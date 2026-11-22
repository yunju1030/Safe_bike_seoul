import type { Point } from "./geo";

export type BicycleRoute = { path: Point[]; distance: number; duration: number };

export function distanceFromRoute([lat, lng]: Point, path: readonly Point[]) {
  const scale = Math.PI * 6_371_000 / 180;
  const longitudeScale = scale * Math.cos(lat * Math.PI / 180);
  let nearest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ay, ax] = [(path[i - 1][0] - lat) * scale, (path[i - 1][1] - lng) * longitudeScale];
    const dx = (path[i][1] - path[i - 1][1]) * longitudeScale;
    const dy = (path[i][0] - path[i - 1][0]) * scale;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return nearest;
}
