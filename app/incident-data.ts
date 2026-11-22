import type { Point } from "./geo";

export type Incident = {
  id: string;
  name: string;
  area: string;
  count: number | null;
  point: Point;
};
