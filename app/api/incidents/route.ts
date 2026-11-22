import { badRequest, checkPortalAuth, number, object, pageNumber, point, providerJson, string, withProvider } from "../_lib/provider";
import type { Incident } from "../../incident-data";

const seoulDistricts = new Set("110 140 170 200 215 230 260 290 305 320 350 380 410 440 470 500 530 545 560 590 620 650 680 710 740".split(" "));
const pageSize = 50;

async function loadPage(key: string, year: string, district: string, page: number) {
  const url = new URL("https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle");
  const decodedKey = /%[\da-f]{2}/i.test(key) ? decodeURIComponent(key) : key;
  url.search = new URLSearchParams({
    serviceKey: decodedKey, searchYearCd: year, siDo: "11", guGun: district,
    type: "json", numOfRows: String(pageSize), pageNo: String(page),
  }).toString();
  const envelope = object(await providerJson(url));
  const response = object(envelope.response ?? envelope);
  const code = String(object(response.header).resultCode ?? response.resultCode ?? "");
  checkPortalAuth(code);
  if (code === "03") return { total: 0, items: [] };
  if (code !== "00" && code !== "0") throw new Error("Invalid incidents response");
  const body = object(response.body ?? response);
  const rawItems = object(body.items).item ?? body.items;
  const entries: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const items = entries.flatMap((entry): Incident[] => {
    const row = object(entry);
    const location = point(row.la_crd, row.lo_crd);
    const name = string(row.spot_nm);
    return location && name ? [{
      id: `${row.spot_cd ?? row.afos_fid ?? row.afos_id ?? ""}:${location.join(",")}`,
      name, area: string(row.sido_sgg_nm), count: number(row.occrrnc_cnt), point: location,
    }] : [];
  });
  return { total: number(body.totalCount) ?? items.length, items };
}

type Snapshot = { year: number | null; items: Incident[] };
let cache: { expires: number; data: Promise<Snapshot> } | undefined;

async function loadLatest(key: string): Promise<Snapshot> {
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format());
  for (let year = currentYear; year >= currentYear - 5; year--) {
    const first = await loadPage(key, String(year), "", 1);
    if (first.total === 0) continue;
    const rest = await Promise.all(Array.from({ length: Math.ceil(first.total / pageSize) - 1 },
      (_, index) => loadPage(key, String(year), "", index + 2)));
    const items = [first, ...rest].flatMap((page) => page.items);
    if (!items.length) throw new Error("Incidents data has no usable positions");
    return { year, items: [...new Map(items.map((item) => [item.id, item])).values()] };
  }
  return { year: null, items: [] };
}

function latestSnapshot(key: string) {
  if (cache && Date.now() < cache.expires) return cache.data;
  const data = loadLatest(key).catch((error: unknown) => {
    if (cache?.data === data) cache = undefined;
    throw error;
  });
  cache = { expires: Date.now() + 3_600_000, data };
  return data;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.size === 0) {
    return withProvider("DATA_GO_KR_API_KEY", async (key) => ({
      source: "data-go-kr", ...await latestSnapshot(key),
    }));
  }

  const year = params.get("year");
  const district = params.get("district");
  const page = pageNumber(params, "page", 1, 1000);
  if (!year || !/^20\d{2}$/.test(year) || !district || !seoulDistricts.has(district) || page === null) {
    return badRequest("조회 연도(year), 서울 자치구 코드(district), 유효한 페이지 번호를 입력해 주세요.");
  }
  return withProvider("DATA_GO_KR_API_KEY", async (key) => ({
    source: "data-go-kr", year: Number(year), district, page, ...await loadPage(key, year, district, page),
  }));
}
