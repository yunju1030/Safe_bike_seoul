"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "./geo";
import { distanceFromRoute, type BicycleRoute } from "./bicycle-route";
import type { Incident } from "./incident-data";
import RideMap, { type Pin } from "./ride-map";
import type { NearbyStation } from "./station-types";
import WeatherCard from "./weather-card";
import { fetchData, requestMessage } from "./data-request";

type Place = { id: string; name: string; address: string; point: Point };
type PlaceField = { text: string; place?: Place };
type StationResult = { query: string; refresh: number } & (
  { items: NearbyStation[]; fetchedAt: string } | { error: string }
);
type RouteResult = { routes: BicycleRoute[]; station: NearbyStation };
const emptyStations: NearbyStation[] = [];
const emptyIncidents: Incident[] = [];
const emptyRoutes: BicycleRoute[] = [];
const stationTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function PlaceSearch({ label, value, onChange }: {
  label: string; value: PlaceField; onChange: (value: PlaceField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ query: string; data: Place[] | string }>();
  const query = value.text.trim();
  const matches = result?.query === query ? result.data : undefined;

  useEffect(() => {
    if (!open || !query || value.place) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { items } = await fetchData<{ items: Place[] }>(`/api/places?q=${encodeURIComponent(query)}`, controller.signal);
        if (!controller.signal.aborted) setResult({ query, data: items });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ query, data: requestMessage(error) });
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, value.place]);

  return (
    <div className="place-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <label><span>{label}</span>
        <input value={value.text} placeholder={`${label} 검색`} autoComplete="off" maxLength={100}
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange({ text: event.target.value }); setOpen(true); }} />
      </label>
      {open && query && !value.place && <div className="search-results" aria-label={`${label} 검색 결과`}>
        {Array.isArray(matches) ? matches.length ? matches.map((place) => (
          <button key={place.id} type="button" onClick={() => {
            onChange({ text: place.name, place }); setOpen(false);
          }}><strong>{place.name}</strong><small>{place.address}</small></button>
        )) : <p role="status">검색 결과가 없습니다.</p> : <p role="status">{matches ?? "장소를 검색하고 있습니다."}</p>}
      </div>}
    </div>
  );
}

export default function BikeDashboard() {
  const [start, setStart] = useState<PlaceField>({ text: "" });
  const [end, setEnd] = useState<PlaceField>({ text: "" });
  const [stationId, setStationId] = useState("");
  const [stationResult, setStationResult] = useState<StationResult>();
  const [refresh, setRefresh] = useState(0);
  const [incidentResult, setIncidentResult] = useState<{ year: number | null; items: Incident[] } | string>();
  const [routeResult, setRouteResult] = useState<RouteResult>();
  const [activeRoute, setActiveRoute] = useState(0);
  const [routeError, setRouteError] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);
  const routeRequest = useRef<AbortController | null>(null);
  const [showStations, setShowStations] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const origin = start.place;
  const destination = end.place;
  const query = origin ? new URLSearchParams({ lat: String(origin.point[0]), lng: String(origin.point[1]) }).toString() : "";
  const currentStations = stationResult?.query === query && stationResult.refresh === refresh ? stationResult : undefined;
  const stations = currentStations && "items" in currentStations ? currentStations.items : emptyStations;
  const station = stations.find(({ id }) => id === stationId) ?? stations[0];
  const routes = routeResult?.routes ?? emptyRoutes;

  useEffect(() => () => routeRequest.current?.abort(), []);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { items, fetchedAt } = await fetchData<{ items: NearbyStation[]; fetchedAt: string }>(`/api/stations?${query}&available=1`, controller.signal);
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
  const incidents = typeof incidentResult === "object" ? incidentResult.items : emptyIncidents;
  const nearbyCounts = useMemo(() => routes.map(({ path }) => new Set(
    incidents.filter(({ point }) => distanceFromRoute(point, path) <= 150).map(({ id }) => id),
  ).size), [routes, incidents]);
  const pins = useMemo<Pin[]>(() => [
    ...(origin ? [{ point: origin.point, label: `검색 출발지 · ${origin.name}`, kind: "origin" as const }] : []),
    ...(station ? [{ point: station.point, label: `출발 대여소 · ${station.name} · ${station.bikes}대`, kind: "start" as const }] : []),
    ...(destination ? [{ point: destination.point, label: `도착 · ${destination.name}`, kind: "end" as const }] : []),
    ...(showStations ? stations.filter(({ id }) => id !== station?.id).map(({ id, point, name, bikes }) => ({
      id, point, label: `${name} · 대여 가능 ${bikes}대`, text: String(bikes), kind: "station" as const,
    })) : []),
    ...(showIncidents ? incidents.map(({ id, point, name, count }) => ({
      id, point, label: `${name} · ${incidentYear}년${count === null ? "" : ` 사고 ${count}건`}`, kind: "incident" as const,
    })) : []),
  ], [origin, station, destination, showStations, showIncidents, stations, incidentYear, incidents]);

  function clearRoute() {
    routeRequest.current?.abort();
    setRouteResult(undefined);
    setRouteError("");
    setLoadingRoute(false);
  }

  async function findRoutes() {
    clearRoute();
    if (!origin || !destination) {
      setRouteError("검색 결과에서 출발지와 목적지를 선택해 주세요.");
      return;
    }
    if (!station) {
      setRouteError("대여 가능한 출발 대여소를 선택해 주세요.");
      return;
    }
    const controller = new AbortController();
    routeRequest.current = controller;
    setLoadingRoute(true);
    const [startLat, startLng] = station.point;
    const [endLat, endLng] = destination.point;
    const params = new URLSearchParams({ startLat: String(startLat), startLng: String(startLng), endLat: String(endLat), endLng: String(endLng) });
    try {
      const response = await fetch(`/api/routes?${params}`, { signal: controller.signal });
      const data = await response.json() as { routes?: BicycleRoute[]; error?: string };
      if (!response.ok || !data.routes?.length) throw new Error(data.error ?? "자전거 경로를 불러오지 못했습니다.");
      if (controller.signal.aborted) return;
      setRouteResult({ routes: data.routes, station });
      setActiveRoute(0);
      setShowRoutes(true);
    } catch (error) {
      if (!controller.signal.aborted) setRouteError(requestMessage(error));
    } finally {
      if (!controller.signal.aborted) setLoadingRoute(false);
    }
  }

  return (
    <>
      <header className="site-header"><div className="header-inner">
        <div className="brand"><span className="brand-mark" aria-hidden="true">🚲</span>Safe Bike Seoul</div>
      </div></header>
      <main className="dashboard route-dashboard">
        <div className="route-workspace">
          <aside className="route-sidebar" aria-label="자전거 경로 계획">
            <section className="card planner">
              <h1>자전거 경로 찾기</h1>
              <form onSubmit={(event) => { event.preventDefault(); void findRoutes(); }}>
                <div className="fields">
                  <PlaceSearch label="출발지" value={start} onChange={(value) => {
                    clearRoute(); setStationId(""); setStart(value);
                  }} />
                  <button className="swap" type="button" aria-label="출발지와 목적지 바꾸기" onClick={() => {
                    clearRoute(); setStationId(""); setStart(end); setEnd(start);
                  }}>⇅</button>
                  <PlaceSearch label="목적지" value={end} onChange={(value) => { clearRoute(); setEnd(value); }} />
                </div>
                <button type="submit" className="primary" disabled={loadingRoute}>{loadingRoute ? "경로를 찾는 중…" : "경로 찾기"}</button>
                {routeError && <p className="form-error" role="alert">{routeError}</p>}
              </form>
            </section>
            <section className="card details" aria-labelledby="station-heading">
              <div className="card-heading"><h2 id="station-heading">출발 대여소</h2>
                <button className="secondary" type="button" disabled={!currentStations} onClick={() => {
                  clearRoute(); setRefresh(refresh + 1);
                }}>다시 조회</button>
              </div>
              {!origin ? <p className="station-status">출발지를 선택하면 가까운 대여소를 찾습니다.</p>
                : !currentStations ? <p className="station-status" role="status">대여소를 조회하고 있습니다.</p>
                : "error" in currentStations ? <p className="station-status" role="status">{currentStations.error}</p>
                : <>
                  {station ? <label className="station-select">
                    <span>대여 가능한 곳 · 가까운 순</span>
                    <select value={station.id} onChange={(event) => { clearRoute(); setStationId(event.target.value); }}>
                      {stations.map(({ id, name, bikes, distanceMeters }) => (
                        <option key={id} value={id}>{name} · {bikes}대 · {distanceMeters}m</option>
                      ))}
                    </select>
                  </label> : <p className="station-status">출발지에서 1.5km 이내에 대여 가능한 대여소가 없습니다.</p>}
                  <p className="station-status">따릉이 조회 <time dateTime={currentStations.fetchedAt}>{stationTime.format(new Date(currentStations.fetchedAt))}</time> (한국 표준시)</p>
                </>}
              <p className="source-note">출처 <a href="https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do">서울 열린데이터광장</a></p>
            </section>
            <section className="card details" aria-labelledby="routes-heading">
              <h2 id="routes-heading">경로 비교</h2>
              {routeResult && destination ? <>
                <p className="comparison-endpoints">{routeResult.station.name} → {destination.name}</p>
                <div className="route-options">
                  {routes.map((route, index) => (
                    <button className="route-option" type="button" key={index} aria-pressed={activeRoute === index}
                      onClick={() => { setActiveRoute(index); setShowRoutes(true); }}>
                      <strong>경로 {index === 0 ? "A" : "B"}</strong>
                      <span className="route-metrics">
                        <span>거리 <b>{(route.distance / 1000).toFixed(2)} km</b></span>
                        <span>예상 소요 <b>약 {Math.max(1, Math.round(route.duration / 60))}분</b></span>
                        <span>인접 사고다발지역 <b>{incidentYear ? `${nearbyCounts[index]}곳` : "자료 없음"}</b></span>
                      </span>
                    </button>
                  ))}
                </div>
                {routes.length === 1 && <p className="station-status">대안 경로 없음</p>}
                <p className="comparison-note">{incidentYear ? `${incidentYear}년 기준 · ` : ""}경로에서 중심점까지 150m 이내인 과거 사고다발지역을 셉니다. 실제 주행 안전성을 판단하는 지표가 아닙니다.</p>
              </> : <p className="station-status" aria-live="polite">{loadingRoute ? "자전거 경로 조회 중" : "출발 대여소와 목적지를 선택한 뒤 경로를 찾아보세요."}</p>}
            </section>
            <WeatherCard key={query} place={origin?.name} query={query} />
            <section className="card details">
              <h2>과거 사고다발지역</h2>
              <p className="station-status" aria-live="polite">{incidentYear ? `${incidentYear}년 기준 · 서울 ${incidents.length}곳` : typeof incidentResult === "string" ? incidentResult : incidentResult ? "자료 없음" : "자료 조회 중"}</p>
              <p className="source-note">출처 <a href="https://www.data.go.kr/data/15056681/openapi.do">한국도로교통공단</a></p>
            </section>
          </aside>
          <section className="card map-card route-map-card" aria-label="서울 자전거 지도">
            <RideMap pins={pins} routes={showRoutes ? routes : emptyRoutes} activeRoute={activeRoute} />
            <div className="map-layers" aria-label="지도 표시 항목">
              <button type="button" aria-pressed={showStations} onClick={() => setShowStations(!showStations)}>따릉이</button>
              <button type="button" aria-pressed={showRoutes} onClick={() => setShowRoutes(!showRoutes)}>경로</button>
              <button type="button" aria-pressed={showIncidents} onClick={() => setShowIncidents(!showIncidents)}>사고</button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
