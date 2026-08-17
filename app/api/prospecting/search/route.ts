import { enforceRateLimit, RateLimitError } from "@/lib/prospecting/rate-limit";

type PlacesResult = {
  id?: string;
  displayName?: { text?: string };
  primaryTypeDisplayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

function text(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    enforceRateLimit(request, "places-search", 12, 60_000);
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error: "GOOGLE_MAPS_API_KEY is not configured.",
          code: "GOOGLE_KEY_REQUIRED",
          setup:
            "Add GOOGLE_MAPS_API_KEY to this Site's production environment variables.",
        },
        { status: 503 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    const keyword = text(body.keyword, 80);
    const city = text(body.city, 80);
    const state = text(body.state, 40);
    const zip = text(body.zip, 12);
    const radius = Math.min(Math.max(Number(body.radius) || 0, 0), 100);
    const maximum = Math.min(Math.max(Number(body.maximum) || 20, 1), 60);
    if (!keyword || !city || !state) {
      return Response.json(
        { error: "Business type, city, and state are required." },
        { status: 400 },
      );
    }

    const area = [city, state, zip].filter(Boolean).join(", ");
    const query = `${keyword} in ${area}${radius ? ` within ${radius} miles` : ""}`;
    const places: PlacesResult[] = [];
    let pageToken: string | undefined;

    while (places.length < maximum) {
      const response = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.primaryTypeDisplayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,nextPageToken",
          },
          body: JSON.stringify({
            textQuery: query,
            pageSize: Math.min(20, maximum - places.length),
            pageToken,
            languageCode: "en",
            regionCode: "US",
            includePureServiceAreaBusinesses: true,
          }),
        },
      );
      const data = (await response.json()) as {
        places?: PlacesResult[];
        nextPageToken?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        return Response.json(
          { error: data.error?.message || "Google Places search failed." },
          { status: response.status },
        );
      }
      places.push(...(data.places || []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    const results = places
      .filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY")
      .slice(0, maximum)
      .map((place) => ({
        googlePlaceId: place.id || null,
        businessName: place.displayName?.text || "Unnamed business",
        category: place.primaryTypeDisplayName?.text || "Business",
        address: place.formattedAddress || "Address unavailable",
        phone: place.nationalPhoneNumber || null,
        website: place.websiteUri || null,
        rating: typeof place.rating === "number" ? place.rating : null,
        reviewCount: place.userRatingCount || 0,
      }));

    return Response.json({ results, query, source: "Google Places" });
  } catch (error) {
    console.error("prospecting.search.failed", error);
    if (error instanceof RateLimitError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: "Unable to search businesses right now." },
      { status: 500 },
    );
  }
}
