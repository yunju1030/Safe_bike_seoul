import type { NearbyStation } from "./station-types";

export const stationRadii = [300, 500, 1000, 2000] as const;
export type StationRadius = typeof stationRadii[number];
export type StationSide = "start" | "end";
export type StationResult = { query: string; refresh: number } & (
  { items: NearbyStation[]; fetchedAt: string } | { error: string }
);

const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function StationPanel({ side, setSide, radius, setRadius, place, result, selectedId, onSelect, refresh }: {
  side: StationSide; setSide: (value: StationSide) => void;
  radius: StationRadius; setRadius: (value: StationRadius) => void;
  place?: string; result?: StationResult; selectedId?: string;
  onSelect: (id: string) => void; refresh: () => void;
}) {
  const data = result && "items" in result ? result : undefined;
  return (
    <section className="card station-panel" aria-labelledby="station-heading">
      <div className="station-panel-header">
        <h2 id="station-heading"><span aria-hidden="true">🚲</span> 따릉이 대여소</h2>
        <div className="station-endpoints" role="group" aria-label="대여소 검색 기준">
          <button type="button" aria-pressed={side === "start"} onClick={() => setSide("start")}>출발지</button>
          <button type="button" aria-pressed={side === "end"} onClick={() => setSide("end")}>도착지</button>
        </div>
        {data && <span className="station-live">실시간</span>}
      </div>
      <div className="station-radius-row">
        <p>{place ? <><strong>{place}</strong> 반경</> : (side === "start" ? "출발지를 선택해 주세요." : "도착지를 선택해 주세요.")}</p>
        <div className="station-radii" role="group" aria-label="대여소 검색 반경">
          {stationRadii.map((meters) => <button key={meters} type="button" aria-pressed={meters === radius} onClick={() => setRadius(meters)}>{meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`}</button>)}
        </div>
      </div>
      {place && !data && <p className="station-status" role="status">{result && "error" in result ? result.error : "대여소를 조회하고 있습니다."}</p>}
      {data && (data.items.length > 0 ? (
        <ol className="station-rows" tabIndex={0} aria-label="가까운 순 대여소">
          {data.items.map(({ id, name, bikes, racks, distanceMeters }, index) => (
            <li className="station-row" key={id}>
              <span className="station-row-rank" aria-hidden="true">{index + 1}</span>
              <div className="station-row-info">
                <strong>{name}</strong>
                <small>{distanceMeters.toLocaleString("ko-KR")}m{racks !== null ? ` · 거치대 ${racks}개` : ""}</small>
                {racks !== null && racks > 0 && bikes !== null && <span className="station-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, bikes / racks * 100))}%` }} /></span>}
              </div>
              <div className="station-quantity"><strong>{bikes ?? "—"}</strong><small>{bikes === null ? "정보 없음" : "대 대여 가능"}</small></div>
              {side === "start" && <button type="button" className="station-pick" aria-pressed={selectedId === id}
                aria-label={`${name} 출발 대여소`} onClick={() => onSelect(id)}>{selectedId === id ? "출발 ✓" : "출발"}</button>}
            </li>
          ))}
        </ol>
      ) : <p className="station-status" role="status">이 반경에 {side === "start" ? "대여 가능한 " : ""}대여소가 없습니다.</p>)}
      <div className="station-panel-footer">
        <span aria-live="polite">{data && <>{data.items.length}곳 · <time dateTime={data.fetchedAt}>{time.format(new Date(data.fetchedAt))}</time> 조회</>}</span>
        <button type="button" onClick={refresh} disabled={!result} aria-label="대여소 새로고침">↻ 새로고침</button>
      </div>
      <p className="station-credit">출처 <a href="https://data.seoul.go.kr/dataList/OA-15493/A/1/datasetView.do">서울 열린데이터광장 공공자전거 실시간 대여정보</a></p>
    </section>
  );
}
