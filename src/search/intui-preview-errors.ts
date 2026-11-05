import type { ProviderSearchResult } from "@/domain/types";

/**
 * Publicly safe, non-sensitive error categories for the authenticated
 * read-only preview. Never serialize arbitrary exceptions or provider bodies.
 */
export type IntuiPreviewFailureCode =
  | "provider_unauthorized"
  | "provider_throttled"
  | "provider_unreachable"
  | "provider_timeout"
  | "provider_http_error"
  | "invalid_provider_response"
  | "no_eligible_offers"
  | "provider_bad_parameters"
  | "server_configuration"
  | "invalid_search"
  | "unexpected";

const mappings: Readonly<Record<string, IntuiPreviewFailureCode>> = {
  unauthorized: "provider_unauthorized",
  rate_limited: "provider_throttled",
  network_error: "provider_unreachable",
  timeout: "provider_timeout",
  http_error: "provider_http_error",
  malformed_response: "invalid_provider_response",
  unverified_price_contract: "no_eligible_offers",
  no_verified_offers: "no_eligible_offers",
  wrong_params: "provider_bad_parameters",
  disabled: "server_configuration",
  missing_secret: "server_configuration",
  integration_disabled: "server_configuration",
  invalid_request: "invalid_search",
  invalid_locations: "invalid_search",
};

/**
 * Only an allowlisted code crosses the server/browser boundary.
 * In particular, never pass through raw error.message or the HTTP response.
 */
export function previewFailureCode(
  result: ProviderSearchResult | undefined,
): IntuiPreviewFailureCode {
  if (!result) return "unexpected";
  if (result.status === "timeout") return "provider_timeout";
  return mappings[result.error?.code ?? ""] ?? "unexpected";
}

export const INTUI_PREVIEW_MESSAGES: Readonly<Record<IntuiPreviewFailureCode, string>> = {
  provider_unauthorized:
    "Intui rejected the API credentials. Check the server-side INTUI_API_KEY.",
  provider_throttled:
    "Intui temporarily limited requests. Please try again later.",
  provider_unreachable:
    "The hosting server could not connect to Intui. Check outbound HTTPS access to api.intui.travel.",
  provider_timeout:
    "The request to Intui timed out. Please try again later.",
  provider_http_error:
    "Intui returned an unsuccessful HTTP status. The service may be temporarily unavailable.",
  invalid_provider_response:
    "The response from Intui did not match the expected structure.",
  no_eligible_offers:
    "Intui returned records, but none passed the price, vehicle and capacity checks for this search.",
  provider_bad_parameters:
    "Intui rejected the search parameters. Check the route, date and time.",
  server_configuration:
    "The hosting server could not use its Intui configuration. Check the required server-side secrets.",
  invalid_search:
    "This search route or its parameters could not be submitted to Intui.",
  unexpected:
    "An unexpected error prevented the Intui quote search.",
};
