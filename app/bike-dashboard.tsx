"use client";

import { useEffect, useMemo, useState } from "react";
import { places } from "./demo-data";
import type { Incident } from "./incident-data";
import RideMap, { type Pin } from "./ride-map";
import type { NearbyStation } from "./station-types";
import WeatherCard from "./weather-card";
import { fetchData, requestMessage } from "./data-request";

type StationResult = { query: string; refresh: number } & (
  { items: NearbyStation[]; fetchedAt: string } | { error: string }
);

const noStations: NearbyStation[] = [];
const noIncidents: Incident[] = [];
const stationTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function PlaceSearch({ label, value, onChange, onSelect }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = value.replace(/\s/g, "").toLowerCase();
  const matches = places.map((place, index) => ({ ...place, index })).filter(({ name, area }) =>
    `${name}${area}`.replace(/\s/g, "").toLowerCase().includes(query),
  );

  return (
    <div className="place-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape") setOpen(false);
    }}>
      <label>
        <span>{label}</span>
        <input value={value} placeholder="예시 장소 검색" autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }} />
      </label>
      {open && (
        <div className="search-results" aria-label={`${label} 검색 결과`}>
          {matches.length === 0 && <p>일치하는 예시 장소가 없습니다.</p>}
          {matches.map(({ name, area, index }) => (
            <button key={name} type="button" onClick={() => {
              onSelect(index);
              setOpen(false);
            }}><strong>{name}</strong><small>{area}</small></button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BikeDashboard() {
  const [start, setStart] = useState<string>(places[0].name);
  const [end, setEnd] = useState<string>(places[1].name);
  const [active, setActive] = useState({ from: 0, to: 1 });
  const [error, setError] = useState("");
  const [showStations, setShowStations] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [incidentResult, setIncidentResult] = useState<{ year: number | null; items: Incident[] } | string>();
  const [stationResult, setStationResult] = useState<StationResult>();
  const [refresh, setRefresh] = useState(0);
  const origin = places[active.from];
  const query = new URLSearchParams({ lat: String(origin.point[0]), lng: String(origin.point[1]) }).toString();
  const currentResult = stationResult?.query === query && stationResult.refresh === refresh ? stationResult : undefined;
  const stations = currentResult && "items" in currentResult ? currentResult.items : noStations;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { items, fetchedAt } = await fetchData<{ items: NearbyStation[]; fetchedAt: string }>(`/api/stations?${query}`, controller.signal);
        if (!controller.signal.aborted) setStationResult({ query, refresh, items, fetchedAt });
      } catch (error) {
        if (!controller.signal.aborted) setStationResult({ query, refresh, error: requestMessage(error) });
      }
    }
    void load();
    return () => controller.abort();
  }, [query, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetchData<{ year: number | null; items: Incident[] }>("/api/incidents", controller.signal);
        if (!controller.signal.aborted) setIncidentResult(result);
      } catch (error) {
        if (!controller.signal.aborted) setIncidentResult(requestMessage(error));
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  const incidentYear = typeof incidentResult === "object" ? incidentResult.year : null;
  const incidents = typeof incidentResult === "object" ? incidentResult.items : noIncidents;
  const pins = useMemo<Pin[]>(() => [
    { point: places[active.from].point, label: `출발 · ${places[active.from].name}`, kind: "start" },
    { point: places[active.to].point, label: `도착 · ${places[active.to].name}`, kind: "end" },
    ...(showStations ? stations.map(({ point, name, bikes }) => ({
      point, label: `${name} · ${bikes === null ? "대여 가능 대수 미제공" : `대여 가능 ${bikes}대`}`,
      text: bikes === null ? "–" : String(bikes), kind: "station" as const,
    })) : []),
    ...(showIncidents ? incidents.map(({ id, point, name, count }) => ({
      id, point, label: `${name} · ${incidentYear}년${count === null ? "" : ` 사고 ${count}건`}`,
      kind: "incident" as const,
    })) : []),
  ], [active, showStations, showIncidents, stations, incidentYear, incidents]);

  function applyPlaces() {
    const from = places.findIndex(({ name }) => name === start.trim());
    const to = places.findIndex(({ name }) => name === end.trim());
    if (from < 0 || to < 0 || from === to) {
      setError(from === to && from >= 0 ? "출발지와 목적지를 다르게 선택해 주세요." : "검색 결과에서 출발지와 목적지를 선택해 주세요.");
      return;
    }
    setError("");
    setActive({ from, to });
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand"><span className="brand-mark" aria-hidden="true">♧</span>Safe Bike Seoul</div>
        </div>
      </header>
      <main className="dashboard">
        <div className="intro">
          <h1>서울 자전거 지도</h1>
          <p>출발지 주변의 따릉이 대여소와 날씨를 확인하고, 과거 사고다발지역을 지도에서 살펴보세요.</p>
        </div>
        <div className="dashboard-grid">
          <section className="card planner" aria-labelledby="planner-heading">
            <h2 id="planner-heading">출발지와 목적지</h2>
            <form onSubmit={(event) => { event.preventDefault(); applyPlaces(); }}>
              <div className="fields">
                <PlaceSearch label="출발지" value={start} onChange={setStart} onSelect={(index) => setStart(places[index].name)} />
                <button type="button" className="swap" aria-label="출발지와 목적지 바꾸기" onClick={() => { setStart(end); setEnd(start); setError(""); }}>⇅</button>
                <PlaceSearch label="목적지" value={end} onChange={setEnd} onSelect={(index) => setEnd(places[index].name)} />
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button type="submit" className="primary">선택한 장소 표시</button>
            </form>
            <p className="station-status route-unavailable">현재 실제 자전거 경로를 제공할 수 없습니다.</p>
          </section>
          <section className="card map-card" aria-label="출발지와 목적지 지도">
            <RideMap pins={pins} />
          </section>
          <div className="layers">
            <section className="card details">
              <div className="card-heading">
                <h2>출발지 주변 따릉이</h2>
                <label className="toggle"><input type="checkbox" checked={showStations} onChange={(event) => setShowStations(event.target.checked)} /><span>지도 표시</span></label>
              </div>
              <div className="station-meta">
                <span>{origin.name} · 직선거리 1.5 km 이내</span>
                <button type="button" disabled={!currentResult} onClick={() => setRefresh(refresh + 1)}>다시 조회</button>
              </div>
              <div aria-live="polite">
                {!currentResult && <p className="station-status">대여소를 조회하고 있습니다.</p>}
                {currentResult && "error" in currentResult && <p className="station-status">{currentResult.error}</p>}
                {currentResult && "items" in currentResult && (
                  <p className="station-status">{stations.length ? `가까운 대여소 ${stations.length}곳` : "주변에 표시할 대여소가 없습니다."}<br />데이터 조회시각 <time dateTime={currentResult.fetchedAt}>{stationTime.format(new Date(currentResult.fetchedAt))}</time> (한국 표준시)</p>
                )}
              </div>
              {stations.length > 0 && <ol className="data-list">
                {stations.map(({ id, name, bikes, distanceMeters }) => (
                  <li key={id}><div>{name}<small className="station-distance">{distanceMeters.toLocaleString("ko-KR")} m</small></div><strong>{bikes === null ? "미제공" : `${bikes}대`}</strong></li>
                ))}
              </ol>}
              <p className="source-note">출처 <a href="https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do">서울 열린데이터광장</a></p>
            </section>
            <section className="card details">
              <div className="card-heading">
                <h2>자전거 사고다발지역</h2>
                <label className="toggle"><input type="checkbox" checked={showIncidents} onChange={(event) => setShowIncidents(event.target.checked)} /><span>지도 표시</span></label>
              </div>
              <p className="station-status" aria-live="polite">
                {!incidentResult ? "사고다발지역을 조회하고 있습니다." : typeof incidentResult === "string" ? incidentResult : incidentYear ? `${incidentYear}년 기준 · 서울 ${incidents.length}곳` : "조회 가능한 최근 사고다발지역 자료가 없습니다."}
              </p>
              <p className="station-status">과거 사고 집계입니다. 현재 사고나 실시간 위험을 알리는 정보가 아닙니다.</p>
              <p className="source-note">출처 <a href="https://www.data.go.kr/data/15056681/openapi.do">한국도로교통공단</a></p>
            </section>
            <WeatherCard key={query} place={origin.name} query={query} />
          </div>
        </div>
      </main>
    </>
  );
}
