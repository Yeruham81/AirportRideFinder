import { z } from "zod";
import { getLocation } from "@/data/locations";
import { isPastPickup, isValidDateString, isValidTimeString } from "@/domain/time";
import type { TransferSearchRequest } from "@/domain/types";
import type { SimulatedOutcome } from "@/providers/mock/mock-adapter";

const str = z.string().max(64);
const int = z.coerce.number().int();

/** Loose URL schema: unknown/invalid values are dropped, then validated below. */
export interface SearchParams {
  from?: string | undefined;
  to?: string | undefined;
  date?: string | undefined;
  time?: string | undefined;
  pax?: number | undefined;
  bags?: number | undefined;
  cat?: string | undefined;
  cxl?: string | undefined;
  sort?: string | undefined;
  demoFail?: string | undefined;
}

const STRING_KEYS = ["from", "to", "date", "time", "cat", "cxl", "sort", "demoFail"] as const;
const NUMBER_KEYS = ["pax", "bags"] as const;

export function parseSearchParams(input: Record<string, unknown>): SearchParams {
  const out: SearchParams = {};
  for (const k of STRING_KEYS) {
    const r = str.safeParse(input[k]);
    if (r.success && r.data) out[k] = r.data;
  }
  for (const k of NUMBER_KEYS) {
    if (input[k] === undefined || input[k] === "") continue;
    const r = int.safeParse(input[k]);
    if (r.success) out[k] = r.data;
  }
  return out;
}

export type FieldErrors = Partial<Record<"from" | "to" | "date" | "time" | "pax" | "bags", string>>;

export const MAX_PASSENGERS = 16;
export const MAX_LUGGAGE = 16;

export function buildRequest(
  p: SearchParams,
  now: Date = new Date(),
): { ok: true; request: TransferSearchRequest } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const pickup = p.from ? getLocation(p.from) : null;
  const dropoff = p.to ? getLocation(p.to) : null;
  if (!pickup) errors.from = "Choose a pickup location.";
  if (!dropoff) errors.to = "Choose a drop-off location.";
  if (pickup && dropoff && pickup.id === dropoff.id)
    errors.to = "Drop-off must differ from pickup.";
  if (!p.date || !isValidDateString(p.date)) errors.date = "Choose a valid pickup date.";
  if (!p.time || !isValidTimeString(p.time)) errors.time = "Choose a valid pickup time.";
  if (p.pax === undefined || p.pax < 1 || p.pax > MAX_PASSENGERS)
    errors.pax = `Choose 1–${MAX_PASSENGERS} passengers.`;
  if (p.bags === undefined || p.bags < 0 || p.bags > MAX_LUGGAGE)
    errors.bags = `Choose 0–${MAX_LUGGAGE} bags.`;
  if (pickup && !errors.date && !errors.time && isPastPickup(p.date!, p.time!, pickup.timeZone, now))
    errors.date = "Pickup must be in the future (local time at pickup).";

  if (Object.keys(errors).length || !pickup || !dropoff) return { ok: false, errors };
  return {
    ok: true,
    request: {
      pickupId: pickup.id,
      dropoffId: dropoff.id,
      localDate: p.date!,
      localTime: p.time!,
      timeZone: pickup.timeZone,
      passengers: p.pax!,
      luggage: p.bags!,
      preferredCurrency: null,
    },
  };
}

/** Demo-only: "?demoFail=aeroride" or "aeroride:timeout,blueterminal". */
export function parseDemoFail(value?: string): Record<string, SimulatedOutcome> {
  const out: Record<string, SimulatedOutcome> = {};
  for (const part of (value ?? "").split(",")) {
    const [id, mode] = part.trim().split(":");
    if (id) out[id] = mode === "timeout" ? "timeout" : "error";
  }
  return out;
}
