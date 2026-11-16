/**
 * Disabled-by-default, authenticated, read-only PRODUCTION price diagnostics.
 * Never registers public adapters, creates transfers, pays or redirects.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { productionRouteInfo } from "@/providers/gettransfer/production-client.server";
import { visibleProductionPrices } from "@/providers/gettransfer/production-prices";
import { buildGetTransferPreviewQuery } from "@/providers/gettransfer/preview-query";
import {
  checkPreviewPassword, consumePreviewLimit, createPreviewSession,
  previewSecretsReady, verifyPreviewSession,
} from "./intui-preview-security";

const COOKIE = "__Host-arf-gettransfer-production";
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "strict", path: "/" } as const;

function privacyHeaders() {
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}

function enabled(): boolean {
  return process.env["GETTRANSFER_PRODUCTION_PREVIEW_ENABLED"] === "true";
}

function privateSecrets() {
  return {
    accessPassword: process.env["INTUI_PREVIEW_ACCESS_PASSWORD"],
    sessionSecret: process.env["INTUI_PREVIEW_SESSION_SECRET"],
  };
}

function configured(): boolean {
  return previewSecretsReady(privateSecrets()) &&
    !!process.env["GETTRANSFER_PRODUCTION_TOKEN"]?.trim();
}

export const getGetTransferProductionPreviewStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    privacyHeaders();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    if (!await verifyPreviewSession(getCookie(COOKIE), privateSecrets()))
      return { kind: "authentication_required" as const };
    return { kind: "authenticated" as const };
  });

export const unlockGetTransferProductionPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ password: z.string().min(1).max(512) }).strict().parse(input))
  .handler(async ({ data }) => {
    privacyHeaders();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    if (!consumePreviewLimit("login", undefined)) return { kind: "rate_limited" as const };
    if (!await checkPreviewPassword(data.password, privateSecrets()))
      return { kind: "rejected" as const };
    const session = await createPreviewSession(privateSecrets());
    if (!session) return { kind: "rejected" as const };
    setCookie(COOKIE, session, { ...COOKIE_OPTIONS, maxAge: 30 * 60 });
    return { kind: "authenticated" as const };
  });

export const lockGetTransferProductionPreview = createServerFn({ method: "POST" })
  .handler(async () => {
    privacyHeaders();
    deleteCookie(COOKIE, COOKIE_OPTIONS);
    return { kind: "signed_out" as const };
  });

const searchInput = z.object({
  routeId: z.string().max(32),
  date: z.string().max(32),
  time: z.string().max(32),
  passengers: z.number().int().min(1).max(16),
}).strict();

export const searchGetTransferProductionPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data }) => {
    privacyHeaders();
    if (!enabled()) return { kind: "disabled" as const };
    if (!configured()) return { kind: "unconfigured" as const };
    const session = getCookie(COOKIE);
    if (!await verifyPreviewSession(session, privateSecrets()))
      return { kind: "authentication_required" as const };
    const prepared = buildGetTransferPreviewQuery(data);
    if (!prepared) return { kind: "invalid" as const };
    if (!consumePreviewLimit("search", session)) return { kind: "rate_limited" as const };

    const result = await productionRouteInfo(prepared.query, {
      token: process.env["GETTRANSFER_PRODUCTION_TOKEN"],
      timeoutMs: 12_000,
    });
    if (result.status !== "ok") return { kind: "error" as const, code: result.status };
    if (result.diagnostics.success !== true) return { kind: "no_offers" as const };
    const offers = visibleProductionPrices(result.diagnostics.prices);
    if (offers.length === 0) return { kind: "no_offers" as const };
    return {
      kind: "ok" as const,
      routeLabel: prepared.routeLabel,
      dateTo: prepared.dateTo,
      retrievedAt: new Date().toISOString(),
      currency: prepared.query.currency ?? "USD",
      offers,
    };
  });
