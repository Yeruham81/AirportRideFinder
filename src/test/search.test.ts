import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STATE, type ComparisonState } from "@/search/compare";
import { searchTransfers } from "@/search/orchestrator";
import { buildRequest } from "@/search/validation";
import { buildViewModel } from "@/search/view-model";
import { getAdapters } from "@/providers/registry";

const NOW = new Date("2026-10-13T12:00:00Z");
const base = { date: "2026-11-01", time: "10:00", pax: 2, bags: 2 };

function req(from: string, to: string, extra: Partial<typeof base> = {}) {
  const r = buildRequest({ from, to, ...base, ...extra }, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.request;
}
const vmFor = async (from: string, to: string, state: Partial<ComparisonState> = {}, extra = {}, simulate = {}) =>
  buildViewModel(
    await searchTransfers(req(from, to, extra), { simulate, timeoutMs: 50 }),
    { ...DEFAULT_STATE, ...state },
  );
const cardPrices = (vm: Awaited<ReturnType<typeof vmFor>>) =>
  vm.sections.filter((s) => s.kind === "primary").flatMap((s) => s.offers.map((c) => c.offer.price.quotedPrice.minor));

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error("network disabled")));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled(); // no external requests ever
  vi.unstubAllGlobals();
});

describe("providers", () => {
  it("four fictional providers are distinct", () => {
    const ids = getAdapters().map((a) => a.provider.id);
    expect(new Set(ids).size).toBe(4);
    expect(getAdapters().every((a) => a.provider.isFictional)).toBe(true);
  });
});

describe("LHR demo scenario", () => {
  it("defaults to standard sedans at 42/47/51/58 USD", async () => {
    const vm = await vmFor("lhr", "central-london");
    expect(vm.focusCategory).toBe("standard_sedan");
    expect(vm.currency).toBe("USD");
    expect(cardPrices(vm)).toEqual([4200, 4700, 5100, 5800]);
    expect(vm.alternativeCount).toBeGreaterThan(0); // other types stay reachable
    expect(vm.completeness).toBe("complete");
  });
  it("sorts high to low", async () => {
    const vm = await vmFor("lhr", "central-london", { sort: "price_desc" });
    expect(cardPrices(vm)).toEqual([5800, 5100, 4700, 4200]);
  });
  it("filters by free cancellation and by category", async () => {
    const free = await vmFor("lhr", "central-london", { cancellation: "free" });
    expect(cardPrices(free)).toEqual([4200, 4700, 5100]);
    expect(free.cancellationOptions.find((o) => o.value === "free")!.count).toBe(
      free.eligibleCount - free.sections.flatMap((s) => s.offers).filter((c) => c.offer.cancellation.kind !== "free_until").length,
    );
    const mini = await vmFor("lhr", "central-london", { category: "minivan" });
    expect(mini.sections.every((s) => s.category === "minivan")).toBe(true);
    expect(mini.categoryOptions.find((o) => o.value === "minivan")!.count).toBe(mini.primaryCount);
  });
  it("respects passenger and luggage capacity", async () => {
    const vm = await vmFor("lhr", "central-london", {}, { pax: 5, bags: 4 });
    const all = vm.sections.flatMap((s) => s.offers);
    expect(all.every((c) => c.offer.maxPassengers >= 5 && c.offer.maxLuggage >= 4)).toBe(true);
    expect(vm.focusCategory).toBe("minivan");
    expect(vm.hiddenForCapacity).toBe(vm.totalOffers - vm.eligibleCount);
    // Economy car (1 bag) is excluded for 2 bags.
    const two = await vmFor("lhr", "central-london", {}, {}, {});
    expect(two.sections.flatMap((s) => s.offers).some((c) => c.offer.category === "economy_sedan")).toBe(false);
  });
  it("strip, cards and lowest label agree", async () => {
    const vm = await vmFor("lhr", "central-london");
    const lowestCard = vm.sections.flatMap((s) => s.offers).find((c) => c.isLowest)!;
    const glanceLowest = vm.glance.find((g) => g.kind === "offer" && g.card.isLowest);
    expect(glanceLowest && glanceLowest.kind === "offer" && glanceLowest.card.offer.id).toBe(lowestCard.offer.id);
    for (const g of vm.glance) {
      if (g.kind !== "offer") continue;
      const card = vm.sections.flatMap((s) => s.offers).find((c) => c.offer.id === g.card.offer.id)!;
      expect(card.offer.price.quotedPrice).toEqual(g.card.offer.price.quotedPrice);
      expect(card.offer.cancellation).toEqual(g.card.offer.cancellation);
    }
  });
  it("mock offers are never presented as live quotes", async () => {
    const vm = await vmFor("lhr", "central-london", { category: "all" });
    for (const c of vm.sections.flatMap((s) => s.offers)) {
      expect(c.offer.quote).toEqual({ kind: "sample" });
      expect(c.offer.source).toBe("mock");
      expect(c.offer.actionable).toBe(false);
      expect(JSON.stringify(c.offer)).not.toMatch(/retrievedAt|expiresAt/);
    }
  });
});

describe("provider status", () => {
  it("a successful empty reply is not a failure", async () => {
    const vm = await vmFor("jfk", "manhattan");
    expect(vm.respondedWithoutOffers.map((p) => p.id)).toEqual(["transfernest"]);
    expect(vm.completeness).toBe("complete");
    expect(vm.failedProviders).toHaveLength(0);
    expect(vm.glance.find((g) => g.provider.id === "transfernest")!.kind).toBe("no_comparable");
  });
  it("errors and timeouts produce partial results", async () => {
    const vm = await vmFor("lhr", "central-london", {}, {}, { aeroride: "error", blueterminal: "timeout" });
    expect(vm.completeness).toBe("partial");
    expect(vm.failedProviders.map((f) => [f.provider.id, f.status])).toEqual([["aeroride", "error"], ["blueterminal", "timeout"]]);
    expect(cardPrices(vm)).toEqual([4200, 5100]);
    expect(vm.glance.find((g) => g.provider.id === "aeroride")!.kind).toBe("unavailable");
  });
  it("all providers failing is its own state", async () => {
    const vm = await vmFor("lhr", "central-london", {}, {}, { skyshuttle: "error", aeroride: "error", transfernest: "error", blueterminal: "timeout" });
    expect(vm.empty).toBe("all_failed");
  });
});

describe("empty states and currency", () => {
  it("unsupported route", async () => {
    const vm = await vmFor("lhr", "manhattan");
    expect(vm.empty).toBe("unsupported_route");
    expect(vm.completeness).toBe("complete");
  });
  it("capacity eliminates all", async () => {
    expect((await vmFor("lhr", "central-london", {}, { pax: 16, bags: 2 })).empty).toBe("capacity");
  });
  it("filters eliminate all", async () => {
    expect((await vmFor("jfk", "manhattan", { category: "minibus", cancellation: "free" }, { pax: 2 })).empty).toBe("filters");
  });
  it("Paris shows EUR everywhere", async () => {
    const vm = await vmFor("cdg", "central-paris", { category: "all" });
    expect(vm.currency).toBe("EUR");
    expect(vm.sections.flatMap((s) => s.offers).every((c) => c.offer.price.quotedPrice.currency === "EUR")).toBe(true);
  });
});

describe("validation", () => {
  it("rejects past dates, same locations and bad counts", () => {
    const r = buildRequest({ from: "lhr", to: "lhr", date: "2020-01-01", time: "10:00", pax: 0, bags: -1 }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["bags", "date", "pax", "to"]);
  });
  it("uses the pickup location's time zone", () => {
    const r = buildRequest({ from: "cdg", to: "central-paris", ...base }, NOW);
    expect(r.ok && r.request.timeZone).toBe("Europe/Paris");
  });
});
