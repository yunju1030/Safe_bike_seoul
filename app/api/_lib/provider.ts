import "server-only";

type SecretName = "SEOUL_API_KEY" | "DATA_GO_KR_API_KEY" | "KAKAO_REST_API_KEY";

const responseHeaders = { "Cache-Control": "no-store" };

export class ProviderAuthError extends Error {}
export class NoDataError extends Error {}

export function checkPortalAuth(code: string) {
  if (["20", "29", "30", "31", "32"].includes(code)) throw new ProviderAuthError();
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: responseHeaders });
}

export async function withProvider<T>(name: SecretName, load: (key: string) => Promise<T>) {
  const key = process.env[name]?.trim();
  if (!key) {
    return Response.json({ code: "not_configured", error: "데이터 제공 서비스가 설정되지 않았습니다." }, {
      status: 503, headers: responseHeaders,
    });
  }

  try {
    const data = await load(key);
    return Response.json(data, { headers: responseHeaders });
  } catch (error) {
    // Provider URLs, headers and error bodies may contain credentials.
    if (error instanceof ProviderAuthError) {
      return Response.json({ code: "provider_auth", error: "데이터 제공 기관의 인증 또는 접근 권한을 확인해 주세요." }, {
        status: 502, headers: responseHeaders,
      });
    }
    if (error instanceof NoDataError) {
      return Response.json({ code: "no_data", error: "표시할 자료가 없습니다." }, {
        status: 404, headers: responseHeaders,
      });
    }
    return Response.json({ code: "provider_unavailable", error: "외부 데이터 서비스에서 응답을 가져오지 못했습니다." }, {
      status: 502, headers: responseHeaders,
    });
  }
}

export async function providerJson(url: URL, headers?: HeadersInit): Promise<unknown> {
  const response = await fetch(url, {
    headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) throw new ProviderAuthError();
  if (!response.ok) throw new Error("Provider request failed");
  if (url.hostname !== "apis.data.go.kr" && url.hostname !== "openapi.seoul.go.kr") return response.json();

  const text = await response.text();
  if (url.hostname === "openapi.seoul.go.kr") {
    const code = /<CODE>\s*(INFO-100|INFO-200)\s*<\/CODE>/i.exec(text.trimStart().startsWith("<") ? text : "")?.[1];
    if (code) return { RESULT: { CODE: code.toUpperCase() } };
    return JSON.parse(text) as unknown;
  }
  // The gateway may send XML for authentication failures even for JSON requests.
  const xmlCode = /<(?:returnReasonCode|resultCode)>\s*(\d{2})\s*<\//i.exec(text.trimStart().startsWith("<") ? text : "");
  if (xmlCode) {
    checkPortalAuth(xmlCode[1]);
    if (xmlCode[1] === "03") return { response: { header: { resultCode: "03" } } };
  }
  const payload: unknown = JSON.parse(text);
  const error = object(object(object(payload).OpenAPI_ServiceResponse).cmmMsgHeader);
  checkPortalAuth(String(error.returnReasonCode ?? ""));
  return payload;
}

export function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function number(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(string(value).trim() || NaN);
  return Number.isFinite(numeric) ? numeric : null;
}

export function point(lat: unknown, lng: unknown): [number, number] | null {
  const latitude = number(lat);
  const longitude = number(lng);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [latitude, longitude];
}

export function pageNumber(params: URLSearchParams, name: string, fallback: number, max: number) {
  const raw = params.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= max ? value : null;
}
