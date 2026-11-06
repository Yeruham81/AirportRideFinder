/**
 * Password-protected, manually triggered GetTransfer sandbox price diagnostics.
 * No booking writes, redirects, public registry inclusion or production requests.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { sandboxRouteInfo } from "@/providers/gettransfer/sandbox-client.server";
import { buildGetTransferPreviewQuery, visibleGetTransferSandboxQuotes } from "@/providers/gettransfer/preview-query";
import {
  checkPreviewPassword, consumePreviewLimit, createPreviewSession,
  previewSecretsReady, verifyPreviewSession,
} from "./intui-preview-security";

const COOKIE = "__Host-arf-gettransfer-sandbox";
const COOKIE_OPTIONS = {
  httpOnly: true, secure: true, sameSite: "strict", path: "/",
} as const;

function restrictResponse() {
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
function enabled() {
  return process.env["GETTRANSFER_SANDBOX_PREVIEW_ENABLED"] === "true";
}
function secrets() {
  return {
    accessPassword: process.env["INTUI_PREVIEW_ACCESS_PASSWORD"],
    sessionSecret: process.env["INTUI_PREVIEW_SESSION_SECRET"],
  };
}
function configured() {
  return enabled() && previewSecretsReady(secrets()) &&
    !!process.env["GETTRANSFER_SANDBOX_TOKEN"]?.trim();
}

export const getGetTransferPreviewStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    restrictResponse();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    if (!await verifyPreviewSession(getCookie(COOKIE), secrets()))
      return { kind: "authentication_required" as const };
    return { kind: "authenticated" as const };
  });

export const unlockGetTransferPreview = createServerFn({ method: "POST" })
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

export const lockGetTransferPreview = createServerFn({ method: "POST" })
  .handler(async () => {
    restrictResponse();
    deleteCookie(COOKIE, COOKIE_OPTIONS);
    return { kind: "signed_out" as const };
  });

const quoteSchema = z.object({
  routeId: z.string().max(32),
  date: z.string().max(32),
  time: z.string().max(32),
  passengers: z.number().int().min(1).max(16),
}).strict();

export const searchGetTransferPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => quoteSchema.parse(input))
  .handler(async ({ data }) => {
    restrictResponse();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    const session = getCookie(COOKIE);
    if (!await verifyPreviewSession(session, secrets()))
      return { kind: "authentication_required" as const };
    const prepared = buildGetTransferPreviewQuery(data);
    if (!prepared) return { kind: "invalid" as const };
    if (!consumePreviewLimit("search", session)) return { kind: "rate_limited" as const };

    const result = await sandboxRouteInfo(prepared.query, {
      token: process.env["GETTRANSFER_SANDBOX_TOKEN"],
      timeoutMs: 12_000,
    });
    if (result.status !== "ok")
      return { kind: "error" as const, code: result.status };
    if (result.diagnostics.success !== true || result.diagnostics.prices.length === 0)
      return { kind: "no_offers" as const };

    // Show only categories with a usable immediate sandbox book_now price.
    // Indicative-only categories are intentionally omitted from the preview.
    // This remains read-only; no booking URL or production offer is exposed.
    const offers = visibleGetTransferSandboxQuotes(result.diagnostics.prices);
    if (offers.length === 0) return { kind: "no_offers" as const };
    return {
      kind: "ok" as const,
      routeLabel: prepared.routeLabel,
      dateTo: prepared.dateTo,
      retrievedAt: new Date().toISOString(),
      currency: prepared.query.currency ?? "USD",
      offers,
      // These are vendor diagnostic fields; units are not guaranteed here.
      // Do not display them as distance/time without documented units.
    };
  });
