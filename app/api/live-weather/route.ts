export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    return Response.json({ error: "Valid coordinates are required" }, { status: 400 });
  const params = new URLSearchParams({
    latitude: latitude.toFixed(3),
    longitude: longitude.toFixed(3),
    current: "apparent_temperature,precipitation_probability,wind_speed_10m",
    timezone: "auto",
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Weather provider unavailable");
    const data = (await response.json()) as {
      current?: {
        apparent_temperature?: number;
        precipitation_probability?: number;
        wind_speed_10m?: number;
        time?: string;
      };
    };
    const current = data.current;
    if (![current?.apparent_temperature, current?.precipitation_probability, current?.wind_speed_10m].every(Number.isFinite))
      throw new Error("Incomplete live weather response");
    return Response.json({
      apparent: current!.apparent_temperature,
      rain: current!.precipitation_probability,
      wind: current!.wind_speed_10m,
      source: "live",
      observedAt: current!.time,
      retrievedAt: new Date().toISOString(),
      refreshAfterSeconds: 600,
    });
  } catch {
    return Response.json({ error: "Live weather is temporarily unavailable" }, { status: 503 });
  }
}
