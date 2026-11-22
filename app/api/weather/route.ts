import { badRequest, checkPortalAuth, NoDataError, number, object, point, providerJson, string, withProvider } from "../_lib/provider";
import { forecastRuns, toWeatherGrid, type WeatherForecast } from "../../weather-data";

function kstTimestamp(date: string, time: string) {
  if (!/^\d{8}$/.test(date) || !/^(?:[01]\d|2[0-3])[0-5]\d$/.test(time)) return null;
  const value = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${time.slice(0, 2)}:${time.slice(2)}:00+09:00`;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const location = point(params.get("lat"), params.get("lng"));
  if (!location || location[0] < 31 || location[0] > 44 || location[1] < 123 || location[1] > 133) {
    return badRequest("기상청 예보 구역의 위도(lat)와 경도(lng)를 입력해 주세요.");
  }
  const grid = toWeatherGrid(...location);
  if (grid.nx < 1 || grid.nx > 149 || grid.ny < 1 || grid.ny > 253) {
    return badRequest("기상청 예보 격자 범위를 벗어난 좌표입니다.");
  }

  return withProvider("DATA_GO_KR_API_KEY", async (key): Promise<WeatherForecast> => {
    const now = new Date();
    for (const { date, time } of forecastRuns(now)) {
      const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
      url.search = new URLSearchParams({
        serviceKey: /%[\da-f]{2}/i.test(key) ? decodeURIComponent(key) : key,
        pageNo: "1", numOfRows: "200", dataType: "JSON", base_date: date, base_time: time,
        nx: String(grid.nx), ny: String(grid.ny),
      }).toString();
      const { response } = object(await providerJson(url));
      const { header, body } = object(response);
      const code = String(object(header).resultCode ?? "");
      checkPortalAuth(code);
      if (code === "03") continue;
      if (code !== "00" && code !== "0") throw new Error("Forecast request rejected");
      const rows = object(object(body).items).item;
      if (!Array.isArray(rows)) continue;

      const slots = new Map<string, Partial<WeatherForecast>>();
      for (const entry of rows) {
        const row = object(entry);
        if (row.category !== "TMP" && row.category !== "POP") continue;
        const issuedAt = kstTimestamp(string(row.baseDate), string(row.baseTime));
        const forecastAt = kstTimestamp(string(row.fcstDate), string(row.fcstTime));
        const value = number(row.fcstValue);
        if (!issuedAt || !forecastAt || Date.parse(forecastAt) < now.getTime() || value === null) continue;
        const slot = slots.get(forecastAt) ?? { issuedAt };
        if (row.category === "TMP") slot.temperatureC = value;
        if (row.category === "POP" && value >= 0 && value <= 100) slot.precipitationProbability = value;
        slots.set(forecastAt, slot);
      }
      for (const [forecastAt, slot] of [...slots].sort(([a], [b]) => a.localeCompare(b))) {
        const { issuedAt, temperatureC, precipitationProbability } = slot;
        if (issuedAt && temperatureC !== undefined && precipitationProbability !== undefined) {
          return { grid, issuedAt, forecastAt, temperatureC, precipitationProbability };
        }
      }
    }
    throw new NoDataError();
  });
}
