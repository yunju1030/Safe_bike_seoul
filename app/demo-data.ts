export type Point = readonly [number, number];

export const places = [
  { name: "여의나루역", area: "영등포구 여의도동", point: [37.5271, 126.9328] },
  { name: "반포한강공원", area: "서초구 반포동", point: [37.5104, 126.996] },
  { name: "이촌한강공원", area: "용산구 이촌동", point: [37.5161, 126.9691] },
] as const satisfies readonly { name: string; area: string; point: Point }[];
