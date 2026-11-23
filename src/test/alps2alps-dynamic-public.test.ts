import { describe, expect, it, vi } from "vitest";
import {
  ALPS_PUBLIC_LOCATIONS_ENDPOINT,
  buildAlpsLocationSearchUrl,
  fetchAlpsLocations, parseAlpsLocations,
  validAlpsLocationCode,
} from "@/providers/alps2alps/public-quote";

describe("Alps2Alps official dynamic public location lookup", () => {
  it("uses only documented, keyless public locations/search endpoint", () => {
    expect(ALPS_PUBLIC_LOCATIONS_ENDPOINT).toBe(
      "https://booking.alps2alps.com/api/public/v1/locations/search");
    const url = new URL(buildAlpsLocationSearchUrl("  Grenoble  "));
    expect(url.pathname).toBe("/api/public/v1/locations/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Grenoble" });
    expect(url.searchParams.has("api_key")).toBe(false);
    for (const s of ["", "a", "x".repeat(81), "mal\nicious"]) {
      expect(() => buildAlpsLocationSearchUrl(s)).toThrow();
    }
  });

  it("accepts published airport/resort/city/train-station codes but never arbitrary URLs or query fragments", () => {
    for (const code of ["airport-1", "resort-168", "train_station-7", "city-46", "airport-25-w"]) {
      expect(validAlpsLocationCode(code)).toBe(true);
    }
    for (const code of [
      "", "other", "airport-0", "airportridefinder", "../transfer",
      "airport-1?promo=TEST", "https://example.com", "file://1", "train-station-1",
    ]) expect(validAlpsLocationCode(code)).toBe(false);
  });

  it("shows verified vendor locations, with country and type, without trusting arbitrary response fields", () => {
    expect(parseAlpsLocations([
      { code: "resort-644", name: "Geneva city", type: "resort", country: "Switzerland", booking_url: "https://bad.example" },
      { code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland" },
      { code: "city-46", name: "Geneva city", type: "city", country: "Switzerland" },
      { code: "city-46", name: "Duplicate", type: "city", country: "Switzerland" },
      { code: "airport-1", name: "Wrong type", type: "resort", country: "France" },
      { code: "javascript:alert(1)", name: "Unsafe", type: "airport", country: "France" },
      { code: "resort-99", name: "\nUnsafe label", type: "resort", country: "France" },
    ])).toEqual([
      { code: "resort-644", name: "Geneva city", type: "resort", country: "Switzerland" },
      { code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland" },
      { code: "city-46", name: "Geneva city", type: "city", country: "Switzerland" },
    ]);
    expect(parseAlpsLocations({ data: [] })).toBeNull();
  });

  it("makes only one GET search after manual invocation and gracefully reports rate limits", async () => {
    const f = vi.fn(async (_url: string) => Response.json([
      { code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland" },
    ]));
    const r = await fetchAlpsLocations("gen", { fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ status: "ok", locations: [{ code: "airport-1" }] });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toContain("/locations/search?q=gen");
    expect(await fetchAlpsLocations("a", { fetchImpl: f as unknown as typeof fetch }))
      .toEqual({ status: "invalid" });
    expect(f).toHaveBeenCalledTimes(1);
    const limited = await fetchAlpsLocations("gen", {
      fetchImpl: vi.fn(async () => new Response(null, { status: 429 })) as unknown as typeof fetch,
    });
    expect(limited).toEqual({ status: "rate_limited" });
  });
});
