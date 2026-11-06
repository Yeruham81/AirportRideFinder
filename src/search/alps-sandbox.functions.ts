/**
 * Separate password-protected, manually triggered Alps2Alps SANDBOX preview.
 * Reuses the existing server-side private preview password/session secret,
 * but signs a separate cookie. No external API requests occur in the loader.
 */
import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { fetchAlpsSandboxQuote } from "@/providers/alps2alps/sandbox-client.server";
import { validateAlpsQuoteQuery } from "@/providers/alps2alps/sandbox-quote";
import {
  checkPreviewPassword, consumePreviewLimit, createPreviewSession,
  previewSecretsReady, verifyPreviewSession,
} from "./intui-preview-security";

const COOKIE = "__Host-arf-alps-sandbox";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;
function headers() {
  setResponseHeader("Cache-Control", "no-store, private");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
function enabled() {
  return process.env["ALPS2ALPS_SANDBOX_PREVIEW_ENABLED"] === "true";
}
function secrets() {
  return {
    accessPassword: process.env["INTUI_PREVIEW_ACCESS_PASSWORD"],
    sessionSecret: process.env["INTUI_PREVIEW_SESSION_SECRET"],
  };
}

export const getAlpsSandboxStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    headers();
    if (!enabled()) return { kind: "disabled" as const };
    if (!previewSecretsReady(secrets())) return { kind: "unconfigured" as const };
    const session = getCookie(COOKIE);
    if (!await verifyPreviewSession(session, secrets())) {
      return { kind: "authentication_required" as const };
    }
    return { kind: "authenticated" as const };
  });

export const unlockAlpsSandbox = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z.object({ password: z.string().min(1).max(512) }).strict().parse(input))
  .handler(async ({ data }) => {
    headers();
    if (!enabled() || !previewSecretsReady(secrets())) return { kind: "disabled" as const };
    if (!consumePreviewLimit("login", undefined)) return { kind: "rate_limited" as const };
    if (!await checkPreviewPassword(data.password, secrets())) return { kind: "rejected" as const };
    const session = await createPreviewSession(secrets());
    if (!session) return { kind: "rejected" as const };
    setCookie(COOKIE, session, { ...COOKIE_OPTIONS, maxAge: 1800 });
    return { kind: "authenticated" as const };
  });

export const lockAlpsSandbox = createServerFn({ method: "POST" })
  .handler(async () => {
    headers();
    deleteCookie(COOKIE, COOKIE_OPTIONS);
    return { kind: "signed_out" as const };
  });

const quoteSchema = z.object({
  date: z.string().max(32),
  time: z.string().max(32),
  passengers: z.number().int().min(1).max(16),
}).strict();

export const searchAlpsSandbox = createServerFn({ method: "POST" })
  .validator((input: unknown) => quoteSchema.parse(input))
  .handler(async ({ data }) => {
    headers();
    if (!enabled()) return { kind: "disabled" as const };
    if (!previewSecretsReady(secrets())) return { kind: "unconfigured" as const };
    const session = getCookie(COOKIE);
    if (!await verifyPreviewSession(session, secrets())) {
      return { kind: "authentication_required" as const };
    }
    if (!validateAlpsQuoteQuery(data).ok) return { kind: "invalid" as const };
    if (!consumePreviewLimit("search", session)) return { kind: "rate_limited" as const };

    const result = await fetchAlpsSandboxQuote(data);
    if (result.status === "ok") {
      return {
        kind: "ok" as const,
        offers: result.offers,
        omitted: result.omitted,
        vehicleCatalog: result.vehicleCatalog,
      };
    }
    if (result.status === "no_offers") return { kind: "no_offers" as const };
    return {
      kind: "error" as const,
      code: result.status,
      stage: "stage" in result ? result.stage : null,
    };
  });
