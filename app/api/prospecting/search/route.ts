import { enforceRateLimit, RateLimitError } from "@/lib/prospecting/rate-limit";

type ProspectResult = { googlePlaceId: string | null; businessName: string; category: string; address: string; phone: string | null; website: string | null; rating: number | null; reviewCount: number; source: string };
type PlacesResult = { id?: string; displayName?: { text?: string }; primaryTypeDisplayName?: { text?: string }; formattedAddress?: string; nationalPhoneNumber?: string; websiteUri?: string; rating?: number; userRatingCount?: number; businessStatus?: string };
type SerperPlace = { placeId?: string; cid?: string; title?: string; category?: string; address?: string; phoneNumber?: string; website?: string; rating?: number; ratingCount?: number };
type NominatimResult = { boundingbox?: string[] };
type OverpassElement = { id: number; type: string; tags?: Record<string, string> };

function text(value: unknown, max = 120) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function cleanUrl(value?: string) {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try { const url = new URL(candidate); return ["http:", "https:"].includes(url.protocol) ? url.toString() : null; } catch { return null; }
}
function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
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

async function searchSerper(apiKey: string, query: string, maximum: number): Promise<ProspectResult[]> {
  const places: SerperPlace[] = [];
  for (let page = 1; places.length < maximum && page <= 10; page += 1) {
    const response = await fetch("https://google.serper.dev/places", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, page }),
    });
    const data = (await response.json()) as { places?: SerperPlace[]; message?: string };
    if (!response.ok) throw new Error(data.message || "Live business search failed.");
    const pageResults = data.places || [];
    if (!pageResults.length) break;
    places.push(...pageResults);
  }
  return places.slice(0, maximum).map((place) => ({
    googlePlaceId: place.placeId || (place.cid ? `serper:${place.cid}` : null),
    businessName: place.title || "Unnamed business",
    category: place.category || "Business",
    address: place.address || "Address unavailable",
    phone: place.phoneNumber || null,
    website: cleanUrl(place.website),
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: Math.max(0, Number(place.ratingCount || 0)),
    source: "Live business index",
  }));
}

function overpassSelectors(keyword: string) {
  const normalized = keyword.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const groups: Array<[RegExp, string[]]> = [
    [/restaurants?|dining|food/, ['["amenity"="restaurant"]', '["amenity"="fast_food"]']],
    [/cafes?|coffee/, ['["amenity"="cafe"]']],
    [/bars?|pubs?|nightclubs?/, ['["amenity"~"bar|pub|nightclub"]']],
    [/baker(y|ies)/, ['["shop"="bakery"]']],
    [/med spas?|medical spas?|spas?/, ['["shop"="beauty"]', '["leisure"="spa"]', '["healthcare"="clinic"]']],
    [/salons?|hair|barbers?/, ['["shop"~"hairdresser|beauty"]']],
    [/dentists?|dental/, ['["amenity"="dentist"]']],
    [/law firms?|lawyers?|attorneys?/, ['["office"="lawyer"]']],
    [/hotels?|lodging|motels?/, ['["tourism"~"hotel|motel|guest_house"]']],
    [/gyms?|fitness/, ['["leisure"="fitness_centre"]']],
    [/car dealerships?|dealerships?|auto dealers?/, ['["shop"="car"]']],
    [/real estate|realtors?/, ['["office"="estate_agent"]']],
    [/hvac|heating|air conditioning/, ['["craft"~"hvac|heating_engineer"]']],
    [/contractors?|construction/, ['["office"="construction_company"]', '["craft"]']],
    [/manufactur(ers?|ing)/, ['["industrial"="factory"]', '["man_made"="works"]']],
  ];
  const mapped = groups.find(([pattern]) => pattern.test(normalized))?.[1];
  if (mapped) return mapped;
  const escaped = normalized.replace(/["\\]/g, "\\$&");
  return [
    `["name"~"${escaped}",i]["amenity"]`,
    `["name"~"${escaped}",i]["shop"]`,
    `["name"~"${escaped}",i]["office"]`,
    `["name"~"${escaped}",i]["craft"]`,
    `["name"~"${escaped}",i]["tourism"]`,
  ];
}

function formattedAddress(tags: Record<string, string>, fallback: string) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return [street, tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ") || fallback;
}

async function searchOpenData(keyword: string, area: string, maximum: number): Promise<ProspectResult[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", area);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { "Accept-Language": "en-US,en;q=0.8", "User-Agent": "CyncroProspecting/1.0 (business discovery; cyncromedia.ai)" } });
  if (!response.ok) throw new Error("Open business search is temporarily unavailable.");
  const locations = (await response.json()) as NominatimResult[];
  const bounds = locations[0]?.boundingbox;
  if (!bounds || bounds.length !== 4) throw new Error("That city or ZIP could not be located.");
  const [south, north, west, east] = bounds;
  const bbox = `${south},${west},${north},${east}`;
  const selectors = overpassSelectors(keyword);
  const statements = selectors.flatMap((selector) => [
    `node${selector}(${bbox});`,
    `way${selector}(${bbox});`,
    `relation${selector}(${bbox});`,
  ]).join("\n");
  const overpassQuery = `[out:json][timeout:25];(${statements});out tags center ${Math.max(maximum * 3, 100)};`;
  let overpassData: { elements?: OverpassElement[] } | null = null;
  for (const endpoint of ["https://overpass.kumi.systems/api/interpreter","https://overpass-api.de/api/interpreter","https://overpass.nchc.org.tw/api/interpreter"]) {
    try {
      const overpassResponse = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(12_000), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "CyncroProspecting/1.0 (business discovery; cyncromedia.ai)" }, body: new URLSearchParams({ data: overpassQuery }) });
      if (!overpassResponse.ok) continue;
      const candidate = (await overpassResponse.json()) as { elements?: OverpassElement[] };
      if (candidate.elements?.length) { overpassData = candidate; break; }
    } catch (error) { console.warn("prospecting.open_index_retry", endpoint, error); }
  }
  if (!overpassData) throw new Error("The live business indexes are busy. Add a premium business-data key for dependable searches, or try again shortly.");
  return (overpassData.elements || []).filter((item) => item.tags?.name).map((item) => {
    const tags = item.tags || {};
    const category = tags.amenity || tags.shop || tags.office || tags.craft || tags.tourism || tags.industrial || "Business";
    return {
      googlePlaceId: `osm:${item.type}:${item.id}`,
      businessName: tags.name,
      category: titleCase(category),
      address: formattedAddress(tags, area),
      phone: tags.phone || tags["contact:phone"] || null,
      website: cleanUrl(tags.website || tags["contact:website"]),
      rating: null,
      reviewCount: 0,
      source: "OpenStreetMap",
    };
  }).slice(0, maximum);
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
    const serperKey = process.env.SERPER_API_KEY;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let results: ProspectResult[] = [], source = "OpenStreetMap", providerNotice: string | null = null;
    if (serperKey) {
      try { results = await searchSerper(serperKey, query, maximum); source = "Live business index"; }
      catch (error) { console.error("prospecting.serper.failed", error); providerNotice = "Primary search was unavailable, so Cyncro continued with its backup index."; }
    }
    if (!results.length && apiKey) {
      try { results = await searchGoogle(apiKey, query, maximum); source = "Google Places"; }
      catch (error) { console.error("prospecting.google.failed", error); providerNotice = "Google was unavailable, so Cyncro used its free open-data provider."; }
    }
    if (!results.length) { results = await searchOpenData(keyword, area, maximum); source = "OpenStreetMap"; }
    const unique = [...new Map(results.map((result) => [resultKey(result), result])).values()].slice(0, maximum);
    return Response.json({ results: unique, query, source, providerNotice, freeMode: !serperKey && (!apiKey || source === "OpenStreetMap") });
  } catch (error) {
    console.error("prospecting.search.failed", error);
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: error instanceof Error ? error.message : "Unable to search businesses right now." }, { status: 500 });
  }
}
