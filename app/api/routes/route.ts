import { badRequest, number, object, point } from "../_lib/provider";
import type { BicycleRoute } from "../../bicycle-route";

const cache = new Map<string, { expires: number; routes: BicycleRoute[] }>();
let nextRequestAt = 0;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const start = point(params.get("startLat"), params.get("startLng"));
  const end = point(params.get("endLat"), params.get("endLng"));
  if (!start || !end || ![start, end].every(([lat, lng]) => lat >= 37.35 && lat <= 37.77 && lng >= 126.7 && lng <= 127.25)) {
    return badRequest("서울과 인접 지역의 출발·도착 좌표를 입력해 주세요.");
  }
  const coordinates = [start, end].map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`);
  if (coordinates[0] === coordinates[1]) return badRequest("출발 대여소와 목적지가 동일합니다.");
  const routeKey = coordinates.join(";");
  const cached = cache.get(routeKey);
  if (cached && cached.expires > Date.now()) return Response.json({ routes: cached.routes });

  const fail = (error: string, status: number) => Response.json({ error }, { status });
  if (Date.now() < nextRequestAt) return fail("요청이 너무 빠릅니다. 잠시 뒤 다시 시도해 주세요.", 429);
  nextRequestAt = Date.now() + 1100;
  try {
    // The routed-bike instance selects the bicycle graph. OSRM ignores the profile path segment.
    const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${routeKey}?alternatives=true&overview=full&geometries=geojson&radiuses=150;150`;
    const response = await fetch(url, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "SafeBikeSeoul/1.0 (+https://github.com/yunju1030/Safe_bike_seoul)" },
    });
    if (response.status === 429) return fail("경로 서비스 요청 한도에 도달했습니다. 잠시 뒤 다시 시도해 주세요.", 429);
    const data = object(await response.json());
    if (data.code === "NoRoute" || data.code === "NoSegment") {
      return fail("출발 대여소 또는 목적지 주변에서 연결 가능한 자전거 경로를 찾지 못했습니다.", 404);
    }
    if (!response.ok || data.code !== "Ok" || !Array.isArray(data.routes)) {
      return fail("자전거 경로 서비스가 정상 응답하지 않았습니다.", 502);
    }
    const routes: BicycleRoute[] = [];
    const seen = new Set<string>();
    for (const entry of data.routes) {
      const route = object(entry);
      const geometry = object(route.geometry);
      const distance = number(route.distance);
      const duration = number(route.duration);
      if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates) || !distance || distance < 0 || !duration || duration < 0) continue;
      const path = geometry.coordinates.map((pair: unknown) => Array.isArray(pair) ? point(pair[1], pair[0]) : null);
      if (path.length < 2 || !path.every((p) => p !== null)) continue;
      const signature = path.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).filter((coordinate, index, all) => coordinate !== all[index - 1]).join(";");
      if (!signature.includes(";") || seen.has(signature)) continue;
      seen.add(signature);
      routes.push({ path, distance, duration });
      if (routes.length === 2) break;
    }
    if (!routes.length) return fail("경로 서비스에서 표시할 수 있는 좌표를 받지 못했습니다.", 502);
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(routeKey, { routes, expires: Date.now() + 300_000 });
    return Response.json({ routes });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return fail("자전거 경로 서비스 응답 시간이 초과됐습니다.", 504);
    return fail("자전거 경로 서비스에 연결할 수 없습니다.", 502);
  }
}
