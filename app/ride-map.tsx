"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { Point } from "./geo";
import type { BicycleRoute } from "./bicycle-route";

export type Pin = { id?: string; label: string; point: Point; kind: "origin" | "start" | "end" | "station" | "incident"; text?: string };

type Coordinate = { getLat(): number; getLng(): number };
type Bounds = { extend(point: Coordinate): void };
type MapView = {
  setBounds(bounds: Bounds, top?: number, right?: number, bottom?: number, left?: number): void;
  getLevel(): number;
  setLevel(level: number): void;
  relayout(): void;
};
type Overlay = { setMap(map: MapView | null): void };
type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => Coordinate;
  LatLngBounds: new () => Bounds;
  Map: new (element: HTMLElement, options: { center: Coordinate; level: number }) => MapView;
  CustomOverlay: new (options: { map: MapView; position: Coordinate; content: HTMLElement; zIndex: number }) => Overlay;
  Polyline: new (options: { map: MapView; path: Coordinate[]; strokeColor: string; strokeWeight: number; strokeOpacity: number; strokeStyle: string; zIndex: number }) => Overlay;
};

const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const symbols = { origin: "검", start: "출", end: "도", station: "●", incident: "" };
const pinOrder = { incident: 1, station: 2, origin: 3, start: 4, end: 4 };
const center: Point = [37.55, 126.99];

function routeStyle(selected: boolean) {
  return { color: selected ? "#1859ed" : "#758298", weight: selected ? 7 : 5, dashed: !selected };
}

function Schematic({ pins, routes, activeRoute }: { pins: Pin[]; routes: BicycleRoute[]; activeRoute: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = pins.filter(({ kind }) => kind !== "incident").map(({ point }) => point).concat(routes.flatMap(({ path }) => path));
  const latitudes = points.map(([lat]) => lat);
  const longitudes = points.map(([, lng]) => lng);
  const minLat = points.length ? Math.min(...latitudes) : 37.46;
  const maxLat = points.length ? Math.max(...latitudes) : 37.65;
  const minLng = points.length ? Math.min(...longitudes) : 126.82;
  const maxLng = points.length ? Math.max(...longitudes) : 127.16;
  const latSpan = Math.max(0.01, maxLat - minLat) / 0.69;
  const lngSpan = Math.max(0.014, maxLng - minLng) / 0.76;
  const centerLat = (maxLat + minLat) / 2;
  const centerLng = (maxLng + minLng) / 2;
  function project([lat, lng]: Point) {
    return [(lng - centerLng) / lngSpan + 0.5, (centerLat - lat) / latSpan + 0.5] as const;
  }

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    function draw() {
      if (!element || !context) return;
      const { clientWidth: width, clientHeight: height } = element;
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      context.scale(ratio, ratio);
      const ordered = routes.map((route, index) => ({ route, selected: index === activeRoute })).sort((a, b) => Number(a.selected) - Number(b.selected));
      for (const { route, selected } of ordered) {
        const style = routeStyle(selected);
        context.beginPath();
        route.path.forEach(([lat, lng], index) => {
          const x = ((lng - centerLng) / lngSpan + 0.5) * width;
          const y = ((centerLat - lat) / latSpan + 0.5) * height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.strokeStyle = style.color;
        context.lineWidth = style.weight;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.setLineDash(style.dashed ? [8, 7] : []);
        context.stroke();
      }
    }
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    draw();
    return () => observer.disconnect();
  }, [routes, activeRoute, centerLng, centerLat, lngSpan, latSpan]);

  return (
    <div className="schematic" aria-label="배경 지도 없는 좌표 미리보기">
      <canvas ref={canvas} aria-hidden="true" />
      {pins.map(({ id, point, kind, label, text }) => {
        const [x, y] = project(point);
        if (x < 0 || x > 1 || y < 0 || y > 1) return null;
        return <span key={id ?? label} className={`map-pin schematic-pin ${kind}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: pinOrder[kind] }} title={label} aria-label={label}>{text ?? symbols[kind]}</span>;
      })}
    </div>
  );
}

export default function RideMap({ pins, routes, activeRoute }: { pins: Pin[]; routes: BicycleRoute[]; activeRoute: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<{ maps: KakaoMaps; view: MapView }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key || engine) return;
    const timer = window.setTimeout(() => setFailed(true), 8000);
    return () => window.clearTimeout(timer);
  }, [engine]);

  function initialize() {
    const maps = (window as Window & { kakao?: { maps?: KakaoMaps } }).kakao?.maps;
    if (!maps?.load) {
      setFailed(true);
      return;
    }
    maps.load(() => {
      if (!container.current) return;
      try {
        const view = new maps.Map(container.current, { center: new maps.LatLng(...center), level: 6 });
        setEngine({ maps, view });
      } catch {
        setFailed(true);
      }
    });
  }

  useEffect(() => {
    if (!engine || !container.current) return;
    const observer = new ResizeObserver(() => engine.view.relayout());
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const { maps, view } = engine;
    const points = pins.filter(({ kind }) => kind !== "incident").map(({ point }) => point).concat(routes.flatMap(({ path }) => path));
    if (!points.length) return;
    const bounds = new maps.LatLngBounds();
    points.forEach((point) => bounds.extend(new maps.LatLng(...point)));
    view.setBounds(bounds, 58, 28, 120, 28);
  }, [engine, pins, routes]);

  useEffect(() => {
    if (!engine) return;
    const { maps, view } = engine;
    const lines = routes.map(({ path }, index) => {
      const selected = index === activeRoute;
      const style = routeStyle(selected);
      return new maps.Polyline({
        map: view, path: path.map((point) => new maps.LatLng(...point)),
        strokeColor: style.color, strokeWeight: style.weight, strokeOpacity: 0.94,
        strokeStyle: style.dashed ? "shortdash" : "solid", zIndex: selected ? 2 : 1,
      });
    });
    return () => lines.forEach((line) => line.setMap(null));
  }, [engine, routes, activeRoute]);

  useEffect(() => {
    if (!engine) return;
    const { maps, view } = engine;
    const markers = pins.map(({ kind, label, point, text }) => {
      const content = document.createElement("span");
      content.className = `map-pin ${kind}`;
      content.textContent = text ?? symbols[kind];
      content.title = label;
      content.setAttribute("aria-label", label);
      return new maps.CustomOverlay({
        map: view, position: new maps.LatLng(...point), content,
        zIndex: pinOrder[kind],
      });
    });
    return () => markers.forEach((marker) => marker.setMap(null));
  }, [engine, pins]);

  return (
    <div className="ride-map">
      {!engine && <Schematic pins={pins} routes={routes} activeRoute={activeRoute} />}
      <div ref={container} className={`kakao-map ${engine ? "ready" : ""}`} aria-label="카카오 지도" aria-hidden={!engine} />
      {key && <Script id="kakao-maps" src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`} onReady={initialize} onError={() => setFailed(true)} />}
      <div className="map-status" role="status">
        {engine ? "카카오맵" : !key ? "좌표 미리보기 · 카카오맵 키 미설정" : failed ? "좌표 미리보기 · 카카오맵 연결 실패" : "카카오맵 연결 중"}
        {!engine && failed && <small>키와 현재 주소의 도메인 등록을 확인해 주세요.</small>}
      </div>
      {engine && (
        <div className="zoom-controls" aria-label="지도 크기 조절">
          <button type="button" aria-label="지도 확대" onClick={() => engine.view.setLevel(Math.max(1, engine.view.getLevel() - 1))}>+</button>
          <button type="button" aria-label="지도 축소" onClick={() => engine.view.setLevel(Math.min(14, engine.view.getLevel() + 1))}>−</button>
        </div>
      )}
      <div className="map-legend">
        <span><i className="legend-station" /> 따릉이 대여 가능 대수</span>
        <span><i className="legend-incident" /> 과거 사고다발지역</span>
      </div>
      <div className="route-attribution">
        <a href="https://routing.openstreetmap.de/about.html">FOSSGIS OSRM 자전거</a>
        {" · "}<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
        {" · "}<a href="https://www.openstreetmap.org/fixthemap">지도 수정</a>
      </div>
    </div>
  );
}
