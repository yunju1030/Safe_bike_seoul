"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { type Point } from "./demo-data";

export type Pin = { id?: string; label: string; point: Point; kind: "start" | "end" | "station" | "incident" | "near-incident"; text?: string };

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
  Polyline: new (options: {
    map: MapView; path: Coordinate[]; strokeColor: string; strokeWeight: number; strokeOpacity: number;
  }) => Overlay;
  CustomOverlay: new (options: { map: MapView; position: Coordinate; content: HTMLElement; zIndex: number }) => Overlay;
};

const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const symbols = { start: "출", end: "도", station: "●", incident: "", "near-incident": "!" };
const pinOrder = { incident: 1, station: 2, "near-incident": 3, start: 4, end: 4 };
const center: Point = [37.519, 126.965];

function project([lat, lng]: Point): [number, number] {
  return [(lng - 126.914) / 0.103, (37.546 - lat) / 0.055];
}

function Schematic({ path, pins }: { path: readonly Point[]; pins: Pin[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const width = 1000;
    const height = 660;
    const line = (points: [number, number][], color: string, weight: number) => {
      context.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineWidth = weight;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
    };
    context.fillStyle = "#e8eee7";
    context.fillRect(0, 0, width, height);
    for (let row = 0; row < 14; row++) {
      for (let column = 0; column < 24; column++) {
        context.fillStyle = (column * 7 + row * 13) % 9 < 2 ? "#d4e5d2" : "#e0e7df";
        context.fillRect(column * 57 - 140 + row * 9, row * 56 - 30, 48, 45);
      }
    }
    for (let index = 0; index < 17; index++) {
      const x = index * 78 - 130;
      line([[x, 0], [x - 30, 210], [x + 65, 450], [x + 130, height]], "#f7f8f2", 5);
    }
    for (let index = 0; index < 11; index++) {
      const y = index * 68 - 70;
      line([[0, y + 35], [310, y], [590, y + 36], [width, y - 10]], "#f7f8f2", 5);
    }
    const river: [number, number][] = [[-80, 143], [115, 190], [225, 244], [342, 306], [458, 340], [574, 389], [665, 438], [756, 423], [860, 375], [1080, 369]];
    line(river, "#c8e2ce", 104);
    line(river, "#b9dce5", 75);
    for (const x of [272, 454, 643, 800]) {
      line([[x + 24, 145], [x, 315], [x - 22, 470], [x - 70, 590]], "#faf8ec", 9);
    }
    const route = path.map((point): [number, number] => {
      const [x, y] = project(point);
      return [x * width, y * height];
    });
    line(route, "#ffffff", 12);
    line(route, "#126d57", 6);
  }, [path]);

  return (
    <div className="schematic" aria-label="한강 주변 예시 지도">
      <canvas ref={canvas} width={1000} height={660} aria-hidden="true" />
      <span className="place-label yeouido">여의도</span>
      <span className="place-label yongsan">용산구</span>
      <span className="place-label dongjak">동작구</span>
      <span className="place-label river">한강</span>
      {pins.map(({ id, point, kind, label, text }) => {
        const [x, y] = project(point);
        if (x < 0 || x > 1 || y < 0 || y > 1) return null;
        return <span key={id ?? label} className={`map-pin schematic-pin ${kind}`} style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: pinOrder[kind] }} title={label} aria-label={label}>{text ?? symbols[kind]}</span>;
      })}
    </div>
  );
}

export default function RideMap({ path, pins }: { path: readonly Point[]; pins: Pin[] }) {
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
    const coordinates = path.map(([lat, lng]) => new maps.LatLng(lat, lng));
    const route = new maps.Polyline({ map: view, path: coordinates, strokeColor: "#126d57", strokeWeight: 6, strokeOpacity: 0.94 });
    return () => route.setMap(null);
  }, [engine, path]);

  useEffect(() => {
    if (!engine) return;
    const { maps, view } = engine;
    const bounds = new maps.LatLngBounds();
    path.forEach(([lat, lng]) => bounds.extend(new maps.LatLng(lat, lng)));
    pins.filter(({ kind }) => kind === "station").forEach(({ point }) => bounds.extend(new maps.LatLng(...point)));
    view.setBounds(bounds, 84, 56, 76, 56);
  }, [engine, path, pins]);

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
      {!engine && <Schematic path={path} pins={pins} />}
      <div ref={container} className={`kakao-map ${engine ? "ready" : ""}`} aria-label="카카오 지도" aria-hidden={!engine} />
      {key && <Script id="kakao-maps" src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`} onReady={initialize} onError={() => setFailed(true)} />}
      <div className="map-status" role="status">
        {engine ? "카카오맵" : !key ? "예시 지도 · 카카오맵 키 미설정" : failed ? "예시 지도 · 카카오맵 연결 실패" : "예시 지도 · 카카오맵 연결 중"}
        {!engine && failed && <small>키와 현재 주소의 도메인 등록을 확인해 주세요.</small>}
      </div>
      {engine && (
        <div className="zoom-controls" aria-label="지도 크기 조절">
          <button type="button" aria-label="지도 확대" onClick={() => engine.view.setLevel(Math.max(1, engine.view.getLevel() - 1))}>+</button>
          <button type="button" aria-label="지도 축소" onClick={() => engine.view.setLevel(Math.min(14, engine.view.getLevel() + 1))}>−</button>
        </div>
      )}
      <div className="map-legend">
        <span><i className="legend-route" /> 예시 경로</span>
        <span><i className="legend-station" /> 따릉이 대여 가능 대수</span>
        <span><i className="legend-incident" /> 과거 사고다발지역</span>
        <span><i className="legend-near-incident" /> 경로 인접 사고다발지역</span>
      </div>
    </div>
  );
}
