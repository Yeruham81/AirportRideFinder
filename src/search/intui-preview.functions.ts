/**
 * Authenticated, read-only Intui Preview server functions.
 * Every data-bearing handler checks an HMAC-signed HttpOnly cookie itself.
 *
 * Defense in depth: session, login throttling, bounded request limit and
 * global feature flags. Per-instance limits MUST be paired with a WAF or a
 * shared distributed limiter on any public-facing deployment.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { LOCATIONS } from "@/data/locations";
import { createIntuiAdapter } from "@/providers/intui/adapter.server";
import { searchTransfers } from "@/search/orchestrator";
import { buildRequest } from "@/search/validation";
import { previewFailureCode } from "./intui-preview-errors";
import {
  checkPreviewPassword,
  consumePreviewLimit,
  createPreviewSession,
  previewSecretsReady,
  verifyPreviewSession,
} from "./intui-preview-security";

const COOKIE = "__Host-arf-intui-preview";
const cookieSettings = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;

const previewSearchSchema = z.object({
  from: z.string().max(64),
  to: z.string().max(64),
  date: z.string().max(64),
  time: z.string().max(64),
  pax: z.number().int().min(1).max(16),
  bags: z.number().int().min(0).max(16),
}).strict();

function previewConfigured() {
  return process.env["INTUI_PREVIEW_ENABLED"] === "true" &&
    process.env["INTUI_LIVE_ENABLED"] === "true" &&
    !!process.env["INTUI_API_KEY"]?.trim();
}

function secrets() {
  return {
    accessPassword: process.env["INTUI_PREVIEW_ACCESS_PASSWORD"],
    sessionSecret: process.env["INTUI_PREVIEW_SESSION_SECRET"],
  };
}

function preventCaching() {
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}

export const unlockIntuiPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ password: z.string().min(1).max(512) }).strict().parse(input))
  .handler(async ({ data }) => {
    preventCaching();
    const config = secrets();
    if (!previewConfigured() || !previewSecretsReady(config)) {
      return { kind: "disabled" as const };
    }
    if (!consumePreviewLimit("login", undefined)) {
      return { kind: "rate_limited" as const };
    }
    if (!await checkPreviewPassword(data.password, config)) {
      return { kind: "rejected" as const };
    }
    const token = await createPreviewSession(config);
    if (!token) return { kind: "rejected" as const };
    setCookie(COOKIE, token, { ...cookieSettings, maxAge: 30 * 60 });
    return { kind: "authenticated" as const };
  });

export const lockIntuiPreview = createServerFn({ method: "POST" })
  .handler(async () => {
    preventCaching();
    deleteCookie(COOKIE, cookieSettings);
    return { kind: "signed_out" as const };
  });

export const loadIntuiPreview = createServerFn({ method: "POST" })
  .validator((input: unknown) => previewSearchSchema.parse(input))
  .handler(async ({ data }) => {
    preventCaching();
    if (!previewConfigured()) {
      return { kind: "disabled" as const };
    }
    const config = secrets();
    if (!previewSecretsReady(config)) {
      return { kind: "unconfigured" as const };
    }
    const token = getCookie(COOKIE);
    if (!await verifyPreviewSession(token, config)) {
      return { kind: "authentication_required" as const };
    }

    const built = buildRequest(data);
    if (!built.ok) return { kind: "invalid" as const, errors: built.errors };
    if (!consumePreviewLimit("search", token)) {
      return { kind: "rate_limited" as const };
    }

    // One vendor only. Never call getAdapters() or include fictional offers.
    const adapter = createIntuiAdapter(LOCATIONS, { enabled: true, timeoutMs: 9000 });
    const response = await searchTransfers(built.request, {
      adapters: [adapter], timeoutMs: 11000,
    });
    const status = response.results[0]?.status;
    if (status === "no_offers") return { kind: "no_offers" as const };
    if (status !== "ok") {
      return {
        kind: "error" as const,
        code: previewFailureCode(response.results[0]),
      };
    }
    return {
      kind: "ok" as const,
      // Never return provider raw links, credentials or actionable offers.
      offers: response.offers.filter((offer) =>
        offer.providerId === "intui" && offer.source === "live" && !offer.actionable
      ),
    };
  });
