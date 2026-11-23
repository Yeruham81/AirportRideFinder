import { describe, expect, it, vi } from "vitest";
import {
  ALPS_PUBLIC_ROUTE_CATALOG_ENDPOINT,
  alpsCatalogAllowsPair,
  fetchAlpsRouteCatalog,
  parseAlpsRouteCatalog,
  suggestAlpsCatalogLocations,
} from "@/providers/alps2alps/public-quote";

const activeRoutes = [
  {
    station: "airport-1", station_name: "Geneva Airport",
    resort: "resort-11", resort_name: "Chamonix", is_active: 1,
  },
  {
    station: "airport-2", station_name: "Grenoble Airport",
    resort: "resort-168", resort_name: "Ischgl", is_active: 1,
  },
  {
    station: "airport-1", station_name: "Geneva Airport",
    resort: "resort-20", resort_name: "Megève Mont Blanc", is_active: 1,
  },
  {
    station: "train_station-7", station_name: "Rail station",
    resort: "resort-11", resort_name: "Chamonix", is_active: true,
  },
  {
    station: "city-88", station_name: "Inactive City",
    resort: "resort-300", resort_name: "Inactive Village", is_active: 0,
  },
  {
    station: "javascript:alert(1)", station_name: "Unsafe",
    resort: "resort-1", resort_name: "Unsafe", is_active: 1,
  },
];

describe("Alps2Alps official active route autocomplete catalog", () => {
  it("extracts active station/resort pairs only and makes suggestions available after one typed character", () => {
    const catalog = parseAlpsRouteCatalog(activeRoutes);
    expect(catalog).not.toBeNull();
    if (!catalog) throw Error();
    expect(catalog.activeRouteCount).toBe(4);
    expect(catalog.locations).toHaveLength(6);
    expect(catalog.locations.find(x => x.code === "airport-1")).toMatchObject({
      name: "Geneva Airport", type: "airport", country: "",
    });
    expect(catalog.locations.some(x => x.name.includes("Inactive"))).toBe(false);
    expect(suggestAlpsCatalogLocations(catalog, "G").map(x => x.name))
      .toContain("Geneva Airport");
    expect(suggestAlpsCatalogLocations(catalog, "i").map(x => x.name))
      .toContain("Ischgl");
    expect(suggestAlpsCatalogLocations(catalog, "Megeve").map(x => x.name))
      .toEqual(["Megève Mont Blanc"]);
  });

  it("filters destination suggestions by active route pair, including reverse travel", () => {
    const catalog = parseAlpsRouteCatalog(activeRoutes);
    if (!catalog) throw Error();
    expect(alpsCatalogAllowsPair(catalog, "airport-2", "resort-168")).toBe(true);
    expect(alpsCatalogAllowsPair(catalog, "resort-168", "airport-2")).toBe(true);
    expect(alpsCatalogAllowsPair(catalog, "airport-2", "resort-11")).toBe(false);
    expect(suggestAlpsCatalogLocations(catalog, "G", "resort-11").map(x => x.name))
      .toEqual(["Geneva Airport"]);
    // "i" is a substring of Chamonix; active-pair filter excludes Ischgl.
    expect(suggestAlpsCatalogLocations(catalog, "I", "airport-1").map(x => x.name))
      .toEqual(["Chamonix"]);
    expect(suggestAlpsCatalogLocations(catalog, "Is", "airport-2").map(x => x.name))
      .toEqual(["Ischgl"]);
  });

  it("rejects malformed, empty and inactive-only route resource responses", () => {
    expect(parseAlpsRouteCatalog({ data: activeRoutes })).toBeNull();
    expect(parseAlpsRouteCatalog([])).toBeNull();
    expect(parseAlpsRouteCatalog(activeRoutes.filter(r => r.is_active === 0))).toBeNull();
  });

  it("performs one keyless GET to the exact partner resource route endpoint only", async () => {
    const f = vi.fn(async (_url: string, _init: RequestInit) => Response.json(activeRoutes));
    const result = await fetchAlpsRouteCatalog({ fetchImpl: f as unknown as typeof fetch });
    expect(result.status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(ALPS_PUBLIC_ROUTE_CATALOG_ENDPOINT);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init).not.toHaveProperty("body");
    expect(String(url)).not.toContain("token");
  });

});
