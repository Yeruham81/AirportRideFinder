/**
 * Convert network failures to a small, non-sensitive diagnostic vocabulary.
 * Never transmit raw exception messages, hostnames, URLs, headers or tokens.
 * Some runtimes intentionally hide their underlying connection error; in that
 * case we can only return "network_error".
 */
export type GetTransferTransportFailure =
  | "dns_error" | "tls_error" | "connect_timeout" | "connection_refused"
  | "connection_reset" | "network_unreachable" | "network_error";

export function classifyGetTransferTransportFailure(error: unknown): GetTransferTransportFailure {
  const codes = new Set<string>();
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current = error;

  // Nested causes are standard with Node/Undici; stop after a few nodes.
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if (visited.has(current)) break;
    visited.add(current);
    const entry = current as Record<string, unknown>;
    if (typeof entry["code"] === "string" && entry["code"].length <= 80) {
      codes.add(entry["code"].toUpperCase());
    }
    if (typeof entry["message"] === "string") {
      // Only match a small fixed set of error signatures. Never return this text.
      messages.push(entry["message"].slice(0, 1000).toLowerCase());
    }
    current = entry["cause"];
  }

  const has = (...values: string[]) => values.some((value) => codes.has(value));
  const contains = (pattern: RegExp) => messages.some((message) => pattern.test(message));

  if (has("ENOTFOUND", "EAI_AGAIN", "ERR_DNS_ERROR") ||
    contains(/\b(?:enotfound|eai_again|dns lookup failed|name resolution failed)\b/))
    return "dns_error";

  if ([...codes].some((code) => /^(?:ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_VERIFY_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)/.test(code)) ||
    contains(/certificate (?:verify|verification|has expired)|tls handshake|ssl handshake|self.signed certificate/))
    return "tls_error";

  if (has("UND_ERR_CONNECT_TIMEOUT", "ETIMEDOUT", "ERR_SOCKET_CONNECTION_TIMEOUT") ||
    contains(/\b(?:und_err_connect_timeout|etimedout|connection timed out)\b/))
    return "connect_timeout";

  if (has("ECONNREFUSED") || contains(/\beconnrefused\b/)) return "connection_refused";
  if (has("ECONNRESET", "EPIPE", "UND_ERR_SOCKET") ||
    contains(/\b(?:econnreset|socket hang up)\b/)) return "connection_reset";
  if (has("EHOSTUNREACH", "ENETUNREACH") ||
    contains(/\b(?:ehostunreach|enetunreach|network is unreachable)\b/))
    return "network_unreachable";

  return "network_error";
}
