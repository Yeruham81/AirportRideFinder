/**
 * Password-protected, manually triggered Transferise sandbox price diagnostics.
 * No booking writes or public registry inclusion. Only sandbox keys accepted.
 * An explicitly marked test booking_url can be opened manually by the developer.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { searchTransferisePlacesSandbox, searchTransferiseSelectedSandbox } from "@/providers/transferise/sandbox-client.server";
import { isTransferiseSandboxKey } from "@/providers/transferise/preview";
import { TRANSFERISE_PLACE_ID, validTransferiseSelectedSearch } from "@/providers/transferise/locations";
import {
  checkPreviewPassword, consumePreviewLimit, createPreviewSession,
  previewSecretsReady, verifyPreviewSession,
} from "./intui-preview-security";

const COOKIE = "__Host-arf-transferise-sandbox";
const COOKIE_OPTIONS = {
  httpOnly: true, secure: true, sameSite: "strict", path: "/",
} as const;

function restrictResponse() {
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
function enabled() {
  return process.env["TRANSFERISE_SANDBOX_PREVIEW_ENABLED"] === "true";
}
function secrets() {
  return {
    accessPassword: process.env["INTUI_PREVIEW_ACCESS_PASSWORD"],
    sessionSecret: process.env["INTUI_PREVIEW_SESSION_SECRET"],
  };
}
function configured() {
  return enabled() && previewSecretsReady(secrets()) &&
    isTransferiseSandboxKey(process.env["TRANSFERISE_SANDBOX_API_KEY"]?.trim());
}

export const getTransferisePreviewStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    restrictResponse();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    if (!await verifyPreviewSession(getCookie(COOKIE), secrets()))
      return { kind: "authentication_required" as const };
    return { kind: "authenticated" as const };
  });

export const unlockTransferisePreview = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ password: z.string().min(1).max(512) }).strict().parse(input))
  .handler(async ({ data }) => {
    restrictResponse();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    if (!consumePreviewLimit("login", undefined)) return { kind: "rate_limited" as const };
    if (!await checkPreviewPassword(data.password, secrets())) return { kind: "rejected" as const };
    const session = await createPreviewSession(secrets());
    if (!session) return { kind: "rejected" as const };
    setCookie(COOKIE, session, { ...COOKIE_OPTIONS, maxAge: 30 * 60 });
    return { kind: "authenticated" as const };
  });

export const lockTransferisePreview = createServerFn({ method: "POST" })
  .handler(async () => {
    restrictResponse();
    deleteCookie(COOKIE, COOKIE_OPTIONS);
    return { kind: "signed_out" as const };
  });

const selectedPlaceSchema = z.object({
  id: z.string().max(110).regex(TRANSFERISE_PLACE_ID),
  query: z.string().trim().min(2).max(100),
}).strict();

const quoteSchema = z.object({
  from: selectedPlaceSchema,
  to: selectedPlaceSchema,
  date: z.string().max(32),
  time: z.string().max(32),
  passengers: z.number().int().min(1).max(16),
  currency: z.enum(["EUR", "GBP", "USD"]),
  pickupTimeZone: z.string().min(1).max(80),
}).strict();

export const getTransferisePlaces = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ query: z.string().trim().min(2).max(100) }).strict().parse(input))
  .handler(async ({ data }) => {
    restrictResponse();
    if (!enabled()) return { kind: "error" as const, code: "disabled" };
    if (!configured()) return { kind: "error" as const, code: "unconfigured" };
    const session = getCookie(COOKIE);
    if (!await verifyPreviewSession(session, secrets())) return { kind: "error" as const, code: "authentication_required" };
    if (!consumePreviewLimit("autocomplete", session)) return { kind: "error" as const, code: "rate_limited" };
    return searchTransferisePlacesSandbox(data.query, { key: process.env["TRANSFERISE_SANDBOX_API_KEY"], timeoutMs: 8_000 });
  });

export const searchTransferisePreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => quoteSchema.parse(input))
  .handler(async ({ data }) => {
    restrictResponse();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    const session = getCookie(COOKIE);
    if (!await verifyPreviewSession(session, secrets()))
      return { kind: "authentication_required" as const };
    if (!validTransferiseSelectedSearch(data)) return { kind: "invalid" as const };
    if (!consumePreviewLimit("search", session)) return { kind: "rate_limited" as const };
    const result = await searchTransferiseSelectedSandbox(data, {
      key: process.env["TRANSFERISE_SANDBOX_API_KEY"],
    });
    if (result.kind !== "ok") return result;
    if (result.offers.length === 0) return { kind: "no_offers" as const };
    return {
      ...result,
      date: data.date, time: data.time, passengers: data.passengers,
      currency: data.currency, pickupTimeZone: data.pickupTimeZone,
    };
  });


