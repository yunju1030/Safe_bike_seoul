import type { Point } from "./demo-data";

export type Incident = {
  id: string;
  name: string;
  area: string;
  count: number | null;
  point: Point;
};
