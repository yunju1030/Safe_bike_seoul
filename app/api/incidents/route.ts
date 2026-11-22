import { badRequest, number, object, pageNumber, point, string } from "../_lib/provider";
import type { Incident } from "../../incident-data";

const seoulDistricts = new Set("110 140 170 200 215 230 260 290 305 320 350 380 410 440 470 500 530 545 560 590 620 650 680 710 740".split(" "));
const pageSize = 50;

type Attempt = { year: number; district: string; page: number; http: number | null; code: string | null; message: string | null; total: number | null };
type IncidentPage = { total: number; items: Incident[]; complete: boolean };
class UpstreamError extends Error {
  constructor(readonly retryable: boolean) { super("Incident provider request failed"); }
}

async function fetchPage(key: string, year: string, district: string, page: number, attempts: Attempt[]): Promise<IncidentPage> {
  const url = new URL("https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle");
  const decodedKey = /%[\da-f]{2}/i.test(key) ? decodeURIComponent(key) : key;
  url.search = new URLSearchParams({
    serviceKey: decodedKey, searchYearCd: year, siDo: "11", guGun: district,
    type: "json", numOfRows: String(pageSize), pageNo: String(page),
  }).toString();
  const attempt: Attempt = { year: Number(year), district, page, http: null, code: null, message: null, total: null };
  attempts.push(attempt);
  const upstream = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4000) });
  attempt.http = upstream.status;
  const text = await upstream.text();
  let envelope: Record<string, unknown> = {};
  try { envelope = object(JSON.parse(text)); } catch { /* Some gateway errors use XML. */ }
  const response = object(envelope.response ?? envelope);
  const gateway = object(object(envelope.OpenAPI_ServiceResponse).cmmMsgHeader);
  const header = object(response.header);
  const body = object(response.body ?? response);
  const code = String(header.resultCode ?? response.resultCode ?? gateway.returnReasonCode ?? /<(?:returnReasonCode|resultCode)>\s*(\d+)\s*<\//i.exec(text)?.[1] ?? "");
  const message = string(header.resultMsg ?? response.resultMsg ?? gateway.errMsg ?? /<(?:errMsg|resultMsg)>\s*([A-Z0-9_]+)\s*<\//i.exec(text)?.[1]);
  attempt.code = /^[0-9]{1,3}$/.test(code) ? code : null;
  // Only publish provider machine codes, never raw messages, URLs or bodies.
  attempt.message = message !== key && /^[A-Z][A-Z0-9_]{0,63}$/.test(message) ? message : null;
  attempt.total = number(body.totalCount);
  if (upstream.ok && code === "03") return { total: 0, items: [], complete: true };
  if (!upstream.ok || (code !== "00" && code !== "0")) {
    throw new UpstreamError(upstream.status === 429 || upstream.status >= 500 || ["01", "02", "04", "05", "23"].includes(code));
  }
  const rawItems = object(body.items).item ?? body.items;
  if (attempt.total === null && !Array.isArray(rawItems)) throw new UpstreamError(true);
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
  const total = attempt.total ?? items.length;
  const expected = Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize));
  return { total, items, complete: items.length >= expected };
}

async function loadPage(key: string, year: string, district: string, page: number, attempts: Attempt[]) {
  try {
    return await fetchPage(key, year, district, page, attempts);
  } catch (error) {
    if (error instanceof UpstreamError && !error.retryable) throw error;
    await new Promise((resolve) => setTimeout(resolve, 350));
    return fetchPage(key, year, district, page, attempts);
  }
}

type Snapshot = { year: number | null; items: Incident[]; status: "complete" | "partial" | "failed"; failedPages: number[]; upstream: Attempt[] };
let cache: { expires: number; data: Promise<Snapshot> } | undefined;

async function loadLatest(key: string): Promise<Snapshot> {
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format());
  const upstream: Attempt[] = [];
  for (let year = currentYear; year >= currentYear - 5; year--) {
    let first: IncidentPage;
    try {
      first = await loadPage(key, String(year), "", 1, upstream);
    } catch {
      return { year, items: [], status: "failed", failedPages: [1], upstream };
    }
    if (first.total === 0) continue;
    const rest = await Promise.allSettled(Array.from({ length: Math.ceil(first.total / pageSize) - 1 },
      (_, index) => loadPage(key, String(year), "", index + 2, upstream)));
    const failedPages = first.complete ? [] : [1];
    const items = [...first.items];
    rest.forEach((page, index) => {
      const expected = Math.min(pageSize, first.total - (index + 1) * pageSize);
      if (page.status === "rejected" || page.value.items.length < expected) failedPages.push(index + 2);
      if (page.status === "fulfilled") items.push(...page.value.items);
    });
    return {
      year, items: [...new Map(items.map((item) => [item.id, item])).values()], failedPages, upstream,
      status: !items.length ? "failed" : failedPages.length ? "partial" : "complete",
    };
  }
  return { year: null, items: [], status: "complete", failedPages: [], upstream };
}

function latestSnapshot(key: string) {
  if (cache && Date.now() < cache.expires) return cache.data;
  const data = loadLatest(key).then((result) => {
    if (cache?.data === data && result.status !== "complete") cache = undefined;
    return result;
  }).catch((error: unknown) => {
    if (cache?.data === data) cache = undefined;
    throw error;
  });
  cache = { expires: Date.now() + 3_600_000, data };
  return data;
}

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const key = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!key) return Response.json({ status: "failed", code: "not_configured", error: "공공데이터포털 인증키가 설정되지 않았습니다." }, { status: 503, headers });
  if (params.size === 0) {
    const result = await latestSnapshot(key);
    return Response.json({ source: "data-go-kr", ...result }, { status: result.status === "failed" ? 502 : 200, headers });
  }

  const year = params.get("year");
  const district = params.get("district");
  const page = pageNumber(params, "page", 1, 1000);
  if (!year || !/^20\d{2}$/.test(year) || !district || !seoulDistricts.has(district) || page === null) {
    return badRequest("조회 연도(year), 서울 자치구 코드(district), 유효한 페이지 번호를 입력해 주세요.");
  }
  const upstream: Attempt[] = [];
  try {
    const result = await loadPage(key, year, district, page, upstream);
    return Response.json({ source: "data-go-kr", year: Number(year), district, page, ...result, status: result.complete ? "complete" : "partial", upstream }, { headers });
  } catch {
    return Response.json({ source: "data-go-kr", year: Number(year), district, page, status: "failed", upstream }, { status: 502, headers });
  }
}
