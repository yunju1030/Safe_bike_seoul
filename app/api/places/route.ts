import { badRequest, object, point, providerJson, string, withProvider } from "../_lib/provider";

export function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 100) return badRequest("q에 검색어를 1~100자로 입력해 주세요.");

  return withProvider("KAKAO_REST_API_KEY", async (key) => {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.search = new URLSearchParams({ query, size: "10", x: "126.978", y: "37.5665", radius: "20000" }).toString();
    const { documents } = object(await providerJson(url, { Authorization: `KakaoAK ${key}` }));
    if (!Array.isArray(documents)) throw new Error("Invalid places response");
    const items = documents.flatMap((entry: unknown) => {
      const row = object(entry);
      const location = point(row.y, row.x);
      const name = string(row.place_name);
      return location && name ? [{
        id: string(row.id), name, address: string(row.road_address_name) || string(row.address_name), point: location,
      }] : [];
    });
    return { source: "kakao", items };
  });
}
