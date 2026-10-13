import { describe, expect, it } from "vitest";
import { compareMoney, formatMoney, moneyFromDecimal } from "@/domain/money";
import { defaultPickupDate, isPastPickup, todayInTimeZone } from "@/domain/time";
import { mapVehicleLabel } from "@/domain/vehicle-taxonomy";

describe("money", () => {
  it("uses currency-specific minor units", () => {
    expect(moneyFromDecimal("USD", "42.5")).toEqual({ currency: "USD", minor: 4250 });
    expect(moneyFromDecimal("JPY", "4200")).toEqual({ currency: "JPY", minor: 4200 });
    expect(moneyFromDecimal("KWD", "12.345")).toEqual({ currency: "KWD", minor: 12345 });
    expect(() => moneyFromDecimal("JPY", "1.5")).toThrow();
    expect(() => moneyFromDecimal("USD", "1.005")).toThrow();
  });
  it("formats 0, 2 and 3 decimal currencies", () => {
    expect(formatMoney(moneyFromDecimal("USD", "42"))).toBe("$42");
    expect(formatMoney(moneyFromDecimal("USD", "78.50"))).toBe("$78.50");
    expect(formatMoney(moneyFromDecimal("JPY", "4200"))).toBe("¥4,200");
    expect(formatMoney(moneyFromDecimal("KWD", "12.345"))).toMatch(/12\.345/);
  });
  it("avoids float errors and refuses cross-currency comparison", () => {
    const a = moneyFromDecimal("USD", "0.1");
    const b = moneyFromDecimal("USD", "0.2");
    expect(a.minor + b.minor).toBe(moneyFromDecimal("USD", "0.3").minor);
    expect(() => compareMoney(a, moneyFromDecimal("EUR", "1"))).toThrow();
  });
});

describe("time", () => {
  const now = new Date("2026-10-13T16:00:00Z");
  it("default date is in the future at the pickup location", () => {
    expect(defaultPickupDate("Europe/London", now) > todayInTimeZone("Europe/London", now)).toBe(true);
  });
  it("rejects past pickups using the pickup time zone", () => {
    expect(isPastPickup("2026-10-12", "10:00", "Europe/London", now)).toBe(true);
    // 16:00Z is 17:00 in London and 12:00 in New York.
    expect(isPastPickup("2026-10-13", "16:30", "Europe/London", now)).toBe(true);
    expect(isPastPickup("2026-10-13", "16:30", "America/New_York", now)).toBe(false);
  });
});

describe("vehicle taxonomy", () => {
  it("maps only through explicit rules", () => {
    expect(mapVehicleLabel("skyshuttle", "People carrier")).toBe("minivan");
    expect(mapVehicleLabel("transfernest", "Private car")).toBe("standard_sedan");
    expect(mapVehicleLabel("aeroride", "Private car")).toBe("unclassified");
    expect(mapVehicleLabel("x", "Luxury hovercraft")).toBe("unclassified");
  });
});
