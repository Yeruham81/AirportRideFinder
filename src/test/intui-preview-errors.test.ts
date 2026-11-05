import { describe, expect, it } from "vitest";
import { INTUI_PREVIEW_MESSAGES, previewFailureCode } from "@/search/intui-preview-errors";
import type { ProviderSearchResult } from "@/domain/types";

const failure = (code: string, status: ProviderSearchResult["status"] = "error"): ProviderSearchResult => ({
  providerId: "intui",
  status,
  offers: [],
  durationMs: 30,
  error: { code, message: "some intentionally private provider exception containing KEY=hidden" },
});

describe("Private Intui diagnostic errors", () => {
  it.each([
    ["unauthorized", "provider_unauthorized"],
    ["rate_limited", "provider_throttled"],
    ["network_error", "provider_unreachable"],
    ["timeout", "provider_timeout"],
    ["http_error", "provider_http_error"],
    ["malformed_response", "invalid_provider_response"],
    ["unverified_price_contract", "no_eligible_offers"],
    ["no_verified_offers", "no_eligible_offers"],
    ["wrong_params", "provider_bad_parameters"],
    ["missing_secret", "server_configuration"],
    ["integration_disabled", "server_configuration"],
    ["invalid_locations", "invalid_search"],
    ["unknown", "unexpected"],
  ] as const)("maps %s to safe code %s", (providerCode, safeCode) => {
    expect(previewFailureCode(failure(providerCode))).toBe(safeCode);
    expect(INTUI_PREVIEW_MESSAGES[safeCode].length).toBeGreaterThan(10);
  });

  it("maps top-level provider timeouts even when their error is missing", () => {
    const result: ProviderSearchResult = { providerId: "intui", status: "timeout", offers: [], durationMs: 123 };
    expect(previewFailureCode(result)).toBe("provider_timeout");
  });

  it("does not leak untrusted error messages or arbitrary provider codes", () => {
    const code = previewFailureCode(failure("random_key_is_secret"));
    expect(code).toBe("unexpected");
    expect(code).not.toContain("secret");
    expect(code).not.toContain("KEY=hidden");
    expect(INTUI_PREVIEW_MESSAGES[code]).not.toContain("KEY=hidden");
    expect(previewFailureCode(undefined)).toBe("unexpected");
  });
});
