export type WeatherForecast = {
  grid: { nx: number; ny: number };
  issuedAt: string;
  forecastAt: string;
  temperatureC: number;
  precipitationProbability: number;
};

// KMA Lambert conformal conic projection for the 5 km DFS grid.
export function toWeatherGrid(lat: number, lng: number) {
  const rad = Math.PI / 180;
  const tangent = (degrees: number) => Math.tan(Math.PI / 4 + degrees * rad / 2);
  const cone = Math.log(Math.cos(30 * rad) / Math.cos(60 * rad)) / Math.log(tangent(60) / tangent(30));
  const factor = (6371.00877 / 5) * Math.cos(30 * rad) * tangent(30) ** cone / cone;
  const originRadius = factor / tangent(38) ** cone;
  const radius = factor / tangent(lat) ** cone;
  const angle = (lng - 126) * rad * cone;
  return {
    nx: Math.round(radius * Math.sin(angle) + 43),
    ny: Math.round(originRadius - radius * Math.cos(angle) + 136),
  };
}

export function forecastRuns(now: Date) {
  // Shift to KST and allow ten minutes for the API to publish each cycle.
  const available = new Date(now.getTime() + (9 * 60 - 10) * 60_000);
  const hoursBack = (available.getUTCHours() + 1) % 3;
  available.setUTCHours(available.getUTCHours() - hoursBack, 0, 0, 0);
  return [0, 1, 2].map((offset) => {
    const iso = new Date(available.getTime() - offset * 3 * 3_600_000).toISOString();
    return { date: iso.slice(0, 10).replaceAll("-", ""), time: iso.slice(11, 16).replace(":", "") };
  });
}
