import { describe, expect, it, vi } from "vitest";
import {
  cleanTransferisePlaceQuery, parseTransferisePlaces, validTransferiseSelectedSearch,
  type TransferiseSelectedSearchInput,
} from "@/providers/transferise/locations";
import { searchTransferisePlacesSandbox, searchTransferiseSelectedSandbox } from "@/providers/transferise/sandbox-client.server";
import { consumePreviewLimit, resetPreviewLimitForTests } from "@/search/intui-preview-security";

const KEY = "tfx_test_fake_key_for_autocomplete_tests";
const NOW = new Date("2026-11-09T10:00:00Z");
const AIRPORT = { ok: true, results: [{ id: "airport:1", kind: "airport", name: "Antalya Airport", label: "Antalya Airport (AYT)", iata: "AYT", country: "Türkiye" }] };
const HOTEL = { ok: true, results: [{ id: "hotel:811", kind: "hotel", name: "Rixos Downtown Antalya Hotel", country: "Türkiye" }] };
const INPUT: TransferiseSelectedSearchInput = {
  from: { id: "airport:1", query: "Antalya" }, to: { id: "hotel:811", query: "Rixos Downtown" },
  date: "2026-11-22", time: "14:00", passengers: 2, currency: "EUR", pickupTimeZone: "Europe/Istanbul",
};
const QUOTE = { ok: true, test: true, date: INPUT.date, time: INPUT.time, passengers: 2, vehicles: [
  { id: 60, name: "Sedan", pricing: "per_vehicle", max_passengers: 3, price: 25.04, currency: "EUR" },
] };

describe("Transferise actual location suggestions", () => {
  it("returns actual records and geography, preserving provider IDs and names without aliases or invented defaults", () => {
    const parsed = parseTransferisePlaces(AIRPORT, "Antalya");
    expect(parsed).toMatchObject({ kind: "ok", places: [{ id: "airport:1", name: "Antalya Airport", iata: "AYT", timeZone: "Europe/Istanbul", searchQuery: "Antalya" }] });
    expect(parseTransferisePlaces({ ok: true, results: [] }, "zz")).toEqual({ kind: "ok", places: [] });
    expect(parseTransferisePlaces({ ok: true }, "zz").kind).toBe("error");
    const london = parseTransferisePlaces({ ok: true, results: [{ id: "airport:99", kind: "airport", name: "Heathrow", iata: "LHR" }] }, "Heathrow");
    expect(london.kind === "ok" && london.places[0]?.timeZone).toBe("Europe/London");
    const unknown = parseTransferisePlaces({ ok: true, results: [{ id: "hotel:99", kind: "hotel", name: "Unknown clock hotel" }] }, "Unknown");
    expect(unknown.kind === "ok" && unknown.places[0]?.timeZone).toBeNull();
  });

  it("filters invalid/reflected records and leaves duplicate names with distinct valid IDs selectable", () => {
    const result = parseTransferisePlaces({ ok: true, results: [
      ...HOTEL.results, { ...HOTEL.results[0], id: "hotel:812" },
      { id: "javascript:alert(1)", name: "Fake", kind: "hotel" },
      { id: "hotel:13", name: KEY, kind: "hotel", secret: KEY },
    ] }, "Rixos", KEY);
    expect(result.kind === "ok" && result.places.map((p) => p.id)).toEqual(["hotel:811", "hotel:812"]);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("accepts a broad-prefix result list while bounding the number of processed records", () => {
    const result = parseTransferisePlaces({ ok: true, results: Array.from({ length: 240 }, (_, index) => ({
      id: `hotel:${index + 1}`, kind: "hotel", name: `River Hotel ${index + 1}`,
    })) }, "RI");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error();
    expect(result.places).toHaveLength(200);
    expect(result.places[0]?.id).toBe("hotel:1");
    expect(result.places[199]?.id).toBe("hotel:200");
  });

  it("requires two characters and uses only the places GET with the server-side sandbox header", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json(AIRPORT));
    expect(cleanTransferisePlaceQuery("A")).toBeNull();
    expect(await searchTransferisePlacesSandbox("A", { key: KEY, fetchImpl: f })).toMatchObject({ kind: "error", code: "invalid" });
    expect(f).not.toHaveBeenCalled();
    const result = await searchTransferisePlacesSandbox("  Antalya  ", { key: KEY, fetchImpl: f });
    expect(result.kind).toBe("ok");
    const [url, init] = f.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("action")).toBe("places");
    expect(new URL(String(url)).searchParams.get("q")).toBe("Antalya");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
    const noKey = vi.fn<typeof fetch>();
    expect(await searchTransferisePlacesSandbox("Antalya", { key: "tfx_live_key", fetchImpl: noKey })).toMatchObject({ kind: "error", code: "invalid_sandbox_key" });
    expect(noKey).not.toHaveBeenCalled();
  });
});

describe("Transferise explicitly selected places", () => {
  it("revalidates both chosen IDs before quoting, without depending on a preset route or exact name", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(AIRPORT)).mockResolvedValueOnce(Response.json(HOTEL))
      .mockResolvedValueOnce(Response.json(QUOTE));
    const result = await searchTransferiseSelectedSandbox(INPUT, { key: KEY, fetchImpl: f, now: NOW });
    expect(result).toMatchObject({ kind: "ok", offers: [{ price: { currency: "EUR", minor: 2504 } }] });
    expect(f.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("action"))).toEqual(["places", "places", "quote"]);
    const url = new URL(String(f.mock.calls[2]![0]));
    expect(url.searchParams.get("from")).toBe("airport:1"); expect(url.searchParams.get("to")).toBe("hotel:811");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("refuses a manually forged or expired ID and never requests a quote for it", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(AIRPORT)).mockResolvedValueOnce(Response.json(HOTEL));
    expect(await searchTransferiseSelectedSandbox({ ...INPUT, to: { ...INPUT.to, id: "hotel:999" } }, { key: KEY, fetchImpl: f, now: NOW }))
      .toMatchObject({ kind: "error", code: "selection_unavailable" });
    expect(f).toHaveBeenCalledTimes(2);
    const invalid = vi.fn<typeof fetch>();
    expect(validTransferiseSelectedSearch({ ...INPUT, to: INPUT.from }, NOW)).toBe(false);
    expect(await searchTransferiseSelectedSandbox({ ...INPUT, from: { id: "", query: "Antalya" } }, { key: KEY, fetchImpl: invalid, now: NOW }))
      .toMatchObject({ kind: "error", code: "invalid" });
    expect(invalid).not.toHaveBeenCalled();
  });

  it("requires a valid pickup time zone and rejects a mismatched known airport clock before quoting", async () => {
    expect(validTransferiseSelectedSearch({ ...INPUT, pickupTimeZone: "" }, NOW)).toBe(false);
    expect(validTransferiseSelectedSearch({ ...INPUT, pickupTimeZone: "Invalid/Zone" }, NOW)).toBe(false);
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json(AIRPORT)).mockResolvedValueOnce(Response.json(HOTEL));
    expect(await searchTransferiseSelectedSandbox({ ...INPUT, pickupTimeZone: "Europe/London" }, { key: KEY, fetchImpl: f, now: NOW }))
      .toMatchObject({ kind: "error", code: "invalid" });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("Private autocomplete request budget", () => {
  it("rejects anonymous access and limits typing independently of manual quote searches", () => {
    resetPreviewLimitForTests();
    const clock = NOW.getTime();
    expect(consumePreviewLimit("autocomplete", undefined, clock)).toBe(false);
    for (let i = 0; i < 40; i++) expect(consumePreviewLimit("autocomplete", "test-session", clock)).toBe(true);
    expect(consumePreviewLimit("autocomplete", "test-session", clock)).toBe(false);
    expect(consumePreviewLimit("search", "test-session", clock)).toBe(true);
    expect(consumePreviewLimit("autocomplete", "test-session", clock + 60_000)).toBe(true);
    resetPreviewLimitForTests();
  });
});

