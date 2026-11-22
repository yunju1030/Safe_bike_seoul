export type Point = readonly [number, number];

export const places = [
  { name: "여의나루역", area: "영등포구 여의도동", point: [37.5271, 126.9328] },
  { name: "반포한강공원", area: "서초구 반포동", point: [37.5104, 126.996] },
  { name: "이촌한강공원", area: "용산구 이촌동", point: [37.5161, 126.9691] },
] as const satisfies readonly { name: string; area: string; point: Point }[];

export const routes = [
  {
    from: 0, to: 1, distance: "8.4", minutes: 34,
    path: [places[0].point, [37.5267, 126.9357], [37.5229, 126.9413], [37.5185, 126.9477], [37.5156, 126.9542], [37.5143, 126.9633], [37.5084, 126.9749], [37.5059, 126.9824], [37.5077, 126.9902], places[1].point],
  },
  {
    from: 0, to: 2, distance: "6.3", minutes: 27,
    path: [places[0].point, [37.528, 126.9378], [37.5332, 126.9446], [37.5311, 126.9501], [37.5232, 126.9565], places[2].point],
  },
  {
    from: 2, to: 1, distance: "5.1", minutes: 23,
    path: [places[2].point, [37.5167, 126.9727], [37.5178, 126.9809], [37.5196, 126.9932], [37.5149, 126.9952], places[1].point],
  },
] as const;
