type NominatimHit = { lat?: string; lon?: string };

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const query = address.trim();
  if (!query) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6_000),
      headers: { "Accept-Language": "en-US,en;q=0.8", "User-Agent": "CyncroDispatch/1.0 (job geocoding; cyncromedia.ai)" },
    });
    if (!response.ok) return null;
    const hits = (await response.json()) as NominatimHit[];
    const lat = Number(hits[0]?.lat), lng = Number(hits[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}
