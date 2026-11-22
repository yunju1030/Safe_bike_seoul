import { badRequest, number, object, pageNumber, point, ProviderAuthError, providerJson, string, withProvider } from "../_lib/provider";
import type { Station } from "../../station-types";

async function loadPage(key: string, page: number, limit: number) {
  const start = (page - 1) * limit + 1;
  const end = page * limit;
  const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/bikeList/${start}/${end}/`);
  const payload = object(await providerJson(url));
  const rentals = object(payload.rentBikeStatus);
  const code = object(rentals.RESULT ?? payload.RESULT).CODE;
  if (code === "INFO-100") throw new ProviderAuthError();
  if (code === "INFO-200") return { items: [], rowCount: 0 };
  if (code !== "INFO-000" || !Array.isArray(rentals.row)) throw new Error("Invalid stations response");
  const items = rentals.row.flatMap((entry: unknown): Station[] => {
    const row = object(entry);
    const location = point(row.stationLatitude, row.stationLongitude);
    const name = string(row.stationName);
    const id = string(row.stationId);
    return id && location && name ? [{ id, name, bikes: number(row.parkingBikeTotCnt), point: location }] : [];
  });
  return { items, rowCount: rentals.row.length };
}

let snapshot: { items: Station[]; fetchedAt: number } | undefined;
let pending: Promise<NonNullable<typeof snapshot>> | undefined;

async function loadSnapshot(key: string) {
  if (snapshot && Date.now() - snapshot.fetchedAt < 30_000) return snapshot;
  pending ??= (async () => {
    const items = new Map<string, Station>();
    const limit = 1000;
    for (let page = 1; page <= 10; page++) {
      const batch = await loadPage(key, page, limit);
      for (const station of batch.items) items.set(station.id, station);
      if (batch.rowCount < limit) return { items: [...items.values()], fetchedAt: Date.now() };
    }
    throw new Error("Station pagination did not finish");
  })();
  try {
    snapshot = await pending;
    return snapshot;
  } finally {
    pending = undefined;
  }
}

function distanceMeters([fromLat, fromLng]: Station["point"], [toLat, toLng]: Station["point"]) {
  const radians = Math.PI / 180;
  const a = Math.sin((toLat - fromLat) * radians / 2) ** 2
    + Math.cos(fromLat * radians) * Math.cos(toLat * radians) * Math.sin((toLng - fromLng) * radians / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("lat") || params.has("lng")) {
    const origin = point(params.get("lat"), params.get("lng"));
    if (!origin) return badRequest("유효한 위도(lat)와 경도(lng)를 함께 입력해 주세요.");

    return withProvider("SEOUL_API_KEY", async (key) => {
      const { items, fetchedAt } = await loadSnapshot(key);
      const radiusMeters = 1500;
      const nearby = items.map((station) => ({ ...station, distanceMeters: distanceMeters(origin, station.point) }))
        .filter((station) => station.distanceMeters <= radiusMeters)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 8)
        .map((station) => ({ ...station, distanceMeters: Math.round(station.distanceMeters) }));
      return { source: "seoul", radiusMeters, fetchedAt: new Date(fetchedAt).toISOString(), items: nearby };
    });
  }

  const page = pageNumber(params, "page", 1, 1000);
  const limit = pageNumber(params, "limit", 100, 1000);
  if (page === null || limit === null) return badRequest("page와 limit은 1~1000의 정수여야 합니다.");

  return withProvider("SEOUL_API_KEY", async (key) => {
    const { items } = await loadPage(key, page, limit);
    return { source: "seoul", page, limit, items };
  });
}
