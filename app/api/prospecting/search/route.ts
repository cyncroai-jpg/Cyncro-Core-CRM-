import { enforceRateLimit, RateLimitError } from "@/lib/prospecting/rate-limit";

type ProspectResult = { googlePlaceId: string | null; businessName: string; category: string; address: string; phone: string | null; website: string | null; rating: number | null; reviewCount: number; source: string };
type PlacesResult = { id?: string; displayName?: { text?: string }; primaryTypeDisplayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; rating?: number; userRatingCount?: number; businessStatus?: string };
type NominatimResult = { osm_id?: number; osm_type?: string; display_name?: string; name?: string; type?: string; category?: string; extratags?: Record<string, string> };

function text(value: unknown, max = 120) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cleanUrl(value?: string) {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try { const url = new URL(candidate); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}
function categoryLabel(item: NominatimResult) {
  return (item.type || item.category || "Business").replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function resultKey(result: ProspectResult) {
  return [result.website || "", result.phone || "", result.businessName, result.address].join("|").toLowerCase().replace(/\s+/g, " ");
}

async function searchGoogle(apiKey: string, query: string, maximum: number): Promise<ProspectResult[]> {
  const places: PlacesResult[] = [];
  let pageToken: string | undefined;
  while (places.length < maximum) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.primaryTypeDisplayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,nextPageToken" },
      body: JSON.stringify({ textQuery: query, pageSize: Math.min(20, maximum - places.length), pageToken, languageCode: "en", regionCode: "US", includePureServiceAreaBusinesses: true }),
    });
    const data = (await response.json()) as { places?: PlacesResult[]; nextPageToken?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message || "Google Places search failed.");
    places.push(...(data.places || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return places.filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY").slice(0, maximum).map((place) => ({
    googlePlaceId: place.id || null,
    businessName: place.displayName?.text || "Unnamed business",
    category: place.primaryTypeDisplayName?.text || "Business",
    address: place.formattedAddress || "Address unavailable",
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: place.userRatingCount || 0,
    source: "Google Places",
  }));
}

async function searchOpenData(query: string, maximum: number): Promise<ProspectResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("dedupe", "1");
  url.searchParams.set("limit", String(Math.min(maximum, 50)));
  const response = await fetch(url, { headers: { "Accept-Language": "en-US,en;q=0.8", "User-Agent": "CyncroProspecting/1.0 (business discovery; cyncromedia.ai)" } });
  if (!response.ok) throw new Error("Open business search is temporarily unavailable.");
  const data = (await response.json()) as NominatimResult[];
  return data.filter((item) => item.name || item.display_name).map((item) => {
    const tags = item.extratags || {};
    return {
      googlePlaceId: item.osm_id && item.osm_type ? `osm:${item.osm_type}:${item.osm_id}` : null,
      businessName: item.name || item.display_name?.split(",")[0] || "Unnamed business",
      category: categoryLabel(item),
      address: item.display_name || "Address unavailable",
      phone: tags.phone || tags["contact:phone"] || null,
      website: cleanUrl(tags.website || tags["contact:website"]),
      rating: null,
      reviewCount: 0,
      source: "OpenStreetMap",
    };
  });
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "business-search", 20, 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    const keyword = text(body.keyword, 80), city = text(body.city, 80), state = text(body.state, 40), zip = text(body.zip, 12);
    const radius = Math.min(Math.max(Number(body.radius) || 0, 0), 100);
    const maximum = Math.min(Math.max(Number(body.maximum) || 20, 1), 60);
    if (!keyword || !city || !state) return Response.json({ error: "Business type, city, and state are required." }, { status: 400 });
    const area = [city, state, zip].filter(Boolean).join(", ");
    const query = `${keyword} in ${area}${radius ? ` within ${radius} miles` : ""}`;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let results: ProspectResult[] = [], source = "OpenStreetMap", providerNotice: string | null = null;
    if (apiKey) {
      try { results = await searchGoogle(apiKey, query, maximum); source = "Google Places"; }
      catch (error) { console.error("prospecting.google.failed", error); providerNotice = "Google was unavailable, so Cyncro used its free open-data provider."; }
    }
    if (!results.length) { results = await searchOpenData(`${keyword}, ${area}`, maximum); source = "OpenStreetMap"; }
    const unique = [...new Map(results.map((result) => [resultKey(result), result])).values()].slice(0, maximum);
    return Response.json({ results: unique, query, source, providerNotice, freeMode: !apiKey || source === "OpenStreetMap" });
  } catch (error) {
    console.error("prospecting.search.failed", error);
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to search businesses right now." }, { status: 500 });
  }
}
