"use client";

import { useEffect, useState } from "react";
import type { WeatherForecast } from "./weather-data";
import { fetchData, requestMessage } from "./data-request";

const displayTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export default function WeatherCard({ place, query }: { place?: string; query: string }) {
  const [forecast, setForecast] = useState<WeatherForecast | string>();

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetchData<WeatherForecast>(`/api/weather?${query}`, controller.signal);
        if (!controller.signal.aborted) setForecast(result);
      } catch (error) {
        if (!controller.signal.aborted) setForecast(requestMessage(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [query]);

  return (
    <section className="card details weather" aria-labelledby="weather-heading">
      <div className="card-heading"><h2 id="weather-heading">출발지 날씨</h2><span className="tag">기상청 단기예보</span></div>
      <div aria-live="polite">
        {place && <p className="station-status">{place}</p>}
        {typeof forecast === "object" ? (
          <>
            <div className="weather-main"><strong>{forecast.temperatureC}°C</strong><span>예보 기온</span></div>
            <dl className="forecast-details">
              <div><dt>강수확률</dt><dd>{forecast.precipitationProbability}%</dd></div>
              <div><dt>발표시각</dt><dd><time dateTime={forecast.issuedAt}>{displayTime.format(new Date(forecast.issuedAt))}</time></dd></div>
              <div><dt>예보시각</dt><dd><time dateTime={forecast.forecastAt}>{displayTime.format(new Date(forecast.forecastAt))}</time></dd></div>
            </dl>
            <p className="station-status">한국 표준시 · 기상청 격자 {forecast.grid.nx}, {forecast.grid.ny}</p>
          </>
        ) : <p className="station-status">{!query ? "출발지를 선택해 주세요." : forecast ?? "출발지 단기예보를 조회하고 있습니다."}</p>}
      </div>
      <p className="source-note">출처 <a href="https://www.data.go.kr/data/15084084/openapi.do">기상청 단기예보</a></p>
    </section>
  );
}
