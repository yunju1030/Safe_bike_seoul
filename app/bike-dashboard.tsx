"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "./geo";
import type { BicycleRoute } from "./bicycle-route";
import { incidentsNearRoute, incidentRadiusMeters, type Incident } from "./incident-data";
import RideMap, { type Pin } from "./ride-map";
import type { NearbyStation } from "./station-types";
import WeatherCard from "./weather-card";
import { fetchData, requestMessage } from "./data-request";
import StationPanel, { type StationRadius, type StationResult, type StationSide } from "./station-panel";

type Place = { id: string; name: string; address: string; point: Point };
type PlaceField = { text: string; place?: Place };
type RouteResult = { routes: BicycleRoute[]; station: NearbyStation };
type IncidentResult = { year: number | null; items: Incident[]; status: "complete" | "partial" };
const emptyStations: NearbyStation[] = [];
const emptyIncidents: Incident[] = [];
const emptyRoutes: BicycleRoute[] = [];
function locationQuery(place?: Place) {
  return place ? new URLSearchParams({ lat: String(place.point[0]), lng: String(place.point[1]) }).toString() : "";
}

function useStations(query: string, refresh: number) {
  const [result, setResult] = useState<StationResult>();
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    async function load() {
      try {
        const { items, fetchedAt } = await fetchData<{ items: NearbyStation[]; fetchedAt: string }>(`/api/stations?${query}`, controller.signal);
        if (!controller.signal.aborted) setResult({ query, refresh, items, fetchedAt });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ query, refresh, error: requestMessage(error) });
      }
    }
    void load();
    return () => controller.abort();
  }, [query, refresh]);
  return result?.query === query && result.refresh === refresh ? result : undefined;
}

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
  const [refresh, setRefresh] = useState(0);
  const [arrivalRefresh, setArrivalRefresh] = useState(0);
  const [side, setSide] = useState<StationSide>("start");
  const [startRadius, setStartRadius] = useState<StationRadius>(500);
  const [endRadius, setEndRadius] = useState<StationRadius>(500);
  const [incidentResult, setIncidentResult] = useState<IncidentResult | string>();
  const [incidentRefresh, setIncidentRefresh] = useState(0);
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
  const query = locationQuery(origin);
  const arrivalQuery = locationQuery(destination);
  const currentStations = useStations(query && `${query}&available=1&radius=${startRadius}`, refresh);
  const arrivalStations = useStations(side === "end" && arrivalQuery ? `${arrivalQuery}&radius=${endRadius}` : "", arrivalRefresh);
  const stations = currentStations && "items" in currentStations ? currentStations.items : emptyStations;
  const visibleStations = side === "start" ? stations : arrivalStations && "items" in arrivalStations ? arrivalStations.items : emptyStations;
  const station = stations.find(({ id }) => id === stationId) ?? stations[0];
  const routes = routeResult?.routes ?? emptyRoutes;

  useEffect(() => () => routeRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const result = await fetchData<IncidentResult>("/api/incidents", controller.signal);
        if (!controller.signal.aborted) setIncidentResult(result);
      } catch (error) {
        if (!controller.signal.aborted) setIncidentResult(requestMessage(error));
      }
    }
    void load();
    return () => controller.abort();
  }, [incidentRefresh]);

  const incidentYear = typeof incidentResult === "object" ? incidentResult.year : null;
  const incidents = typeof incidentResult === "object" ? incidentResult.items : emptyIncidents;
  const partialIncidents = typeof incidentResult === "object" && incidentResult.status === "partial";
  const incidentStatus = typeof incidentResult === "string" ? "사고정보 조회 실패. 다시 조회해 주세요."
    : !incidentResult ? "자료 조회 중"
    : partialIncidents ? `${incidentYear}년 기준 · 일부 지역만 조회 성공 (${incidents.length}곳 확인)`
    : `${incidentYear ? `${incidentYear}년 기준 · 서울 ` : ""}${incidents.length}곳${incidents.length ? "" : " · 정상 조회"}`;
  const nearbyByRoute = useMemo(() => routes.map(({ path }) => incidentsNearRoute(incidents, path)), [routes, incidents]);
  const selectedNearby = nearbyByRoute[activeRoute];
  const pins = useMemo<Pin[]>(() => [
    ...(origin ? [{ point: origin.point, label: `검색 출발지 · ${origin.name}`, kind: "origin" as const }] : []),
    ...(station ? [{ point: station.point, label: `출발 대여소 · ${station.name} · ${station.bikes}대`, kind: "start" as const }] : []),
    ...(destination ? [{ point: destination.point, label: `도착 · ${destination.name}`, kind: "end" as const }] : []),
    ...(showStations ? visibleStations.filter(({ id }) => id !== station?.id).map(({ id, point, name, bikes }) => ({
      id, point, label: `${name} · ${bikes === null ? "대여 가능 대수 정보 없음" : `대여 가능 ${bikes}대`}`, text: bikes === null ? "—" : String(bikes), kind: "station" as const,
    })) : []),
    ...(showIncidents ? incidents.map(({ id, point, name, count }) => ({
      id, point, label: `${name} · ${incidentYear}년${count === null ? "" : ` 사고 ${count}건`}`, kind: "incident" as const,
    })) : []),
  ], [origin, station, destination, showStations, showIncidents, visibleStations, incidentYear, incidents]);

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
            <StationPanel side={side} setSide={setSide} radius={side === "start" ? startRadius : endRadius}
              setRadius={(radius) => {
                if (side === "end") setEndRadius(radius);
                else if (radius !== startRadius) { clearRoute(); setStartRadius(radius); }
              }}
              place={side === "start" ? origin?.name : destination?.name}
              result={side === "start" ? currentStations : arrivalStations} selectedId={station?.id}
              onSelect={(id) => { if (id !== station?.id) { clearRoute(); setStationId(id); } }}
              refresh={() => {
                if (side === "end") setArrivalRefresh(arrivalRefresh + 1);
                else { clearRoute(); setRefresh(refresh + 1); }
              }} />
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
                        <span>인접 사고다발지역 <b>{typeof incidentResult === "string" ? "조회 불가" : !incidentResult ? "조회 중" : `${nearbyByRoute[index].length}곳${partialIncidents ? " 확인 · 일부" : ""}`}</b></span>
                      </span>
                    </button>
                  ))}
                </div>
                {routes.length === 1 && <p className="station-status">대안 경로 없음</p>}
                <p className="comparison-note">{incidentYear ? `${incidentYear}년 기준 · ` : ""}경로에서 중심점까지 {incidentRadiusMeters}m 이내인 과거 사고다발지역을 셉니다. 실제 주행 안전성을 판단하는 지표가 아닙니다.</p>
              </> : <p className="station-status" aria-live="polite">{loadingRoute ? "자전거 경로 조회 중" : "출발 대여소와 목적지를 선택한 뒤 경로를 찾아보세요."}</p>}
            </section>
            <section className="card details incident-panel" aria-labelledby="incident-heading">
              <div className="card-heading"><h2 id="incident-heading">{selectedNearby ? `경로 ${activeRoute === 0 ? "A" : "B"} 주변 사고다발지역` : "과거 사고다발지역"}</h2>
                {incidentYear && <span className="tag">{incidentYear}년 과거 통계</span>}
                <button className="incident-refresh" type="button" disabled={!incidentResult} onClick={() => {
                  setIncidentResult(undefined);
                  setIncidentRefresh(incidentRefresh + 1);
                }}>다시 조회</button>
              </div>
              <p className="station-status" aria-live="polite">{incidentStatus}</p>
              {typeof incidentResult === "object" && (
                <div className="incident-route-results" aria-live="polite">
                  {!selectedNearby ? <p className="station-status">경로를 선택하면 주변 사고다발지역을 확인할 수 있습니다.</p>
                    : selectedNearby.length === 0 ? <p className="incident-empty">{partialIncidents ? "조회된 자료에서 확인된 사고다발지역 없음 · 일부 미조회" : "사고다발지역 없음"}</p>
                    : <ol className="incident-rows">
                      {selectedNearby.map(({ incident, distance }) => {
                        const severity = (incident.fatal ?? 0) > 0 ? "사망사고 포함"
                          : (incident.serious ?? 0) > 0 ? "중상사고 포함"
                          : (incident.minor ?? 0) > 0 || (incident.reported ?? 0) > 0 ? "경상·부상신고" : null;
                        const details = [
                          ["사상자", incident.casualties], ["사망", incident.fatal], ["중상", incident.serious],
                          ["경상", incident.minor], ["부상신고", incident.reported],
                        ] as const;
                        return <li key={incident.id}>
                          <div className="incident-accident-count"><strong>{incident.count ?? "—"}</strong><small>사고 건수</small></div>
                          <div>
                            <h3>{incident.name}</h3>
                            <p className="incident-distance">{severity && <span className="incident-severity" data-severe={(incident.fatal ?? 0) > 0 || (incident.serious ?? 0) > 0}>{severity}</span>} 경로에서 약 {Math.round(distance)}m</p>
                            <p className="incident-casualties">{details.filter(([, count]) => count !== null).map(([label, count]) => `${label} ${count}명`).join(" · ")}</p>
                          </div>
                        </li>;
                      })}
                    </ol>}
                </div>
              )}
              <p className="source-note">출처 <a href="https://www.data.go.kr/data/15056681/openapi.do">한국도로교통공단</a></p>
            </section>
            <WeatherCard key={query} place={origin?.name} query={query} />
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
