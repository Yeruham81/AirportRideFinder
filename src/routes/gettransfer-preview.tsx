import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CarFront, KeyRound, Lock, UsersRound } from "lucide-react";
import { getLocation } from "@/data/locations";
import { formatMoney } from "@/domain/money";
import { defaultPickupDate } from "@/domain/time";
import { GETTRANSFER_PREVIEW_ROUTES } from "@/providers/gettransfer/preview-query";
import {
  getGetTransferPreviewStatus, lockGetTransferPreview,
  searchGetTransferPreview, unlockGetTransferPreview,
} from "@/search/gettransfer-preview.functions";

export const Route = createFileRoute("/gettransfer-preview")({
  loader: async () => getGetTransferPreviewStatus(),
  head: () => ({
    meta: [
      { title: "GetTransfer sandbox preview — AirportRideFinder" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Private GetTransfer sandbox price diagnostic. Not a booking page." },
    ],
  }),
  component: GetTransferSandboxPreview,
});

type Quote = Awaited<ReturnType<typeof searchGetTransferPreview>> |
  { kind: "request_failed" };

const ERROR_LABELS: Record<string, string> = {
  missing_token: "Sandbox token missing from the server.",
  unauthorized: "The sandbox access token was rejected (401).",
  forbidden: "The sandbox denied this request (403).",
  rate_limited: "GetTransfer returned a rate limit (429).",
  http_error: "The sandbox service returned an unexpected response.",
  malformed_response: "The sandbox response could not be verified.",
  timeout: "The sandbox did not respond before the timeout.",
  network_error: "The hosting runtime could not complete the sandbox connection. The underlying cause was not exposed by the runtime.",
  dns_error: "The hosting server could not resolve the sandbox hostname (DNS). Check DNS and outbound connectivity in the deployment environment.",
  tls_error: "TLS/certificate negotiation with the sandbox failed. Check the hosting environment and the provider certificate.",
  connect_timeout: "Connection to the sandbox timed out before an HTTP response was received.",
  connection_refused: "The sandbox host refused the TCP connection.",
  connection_reset: "The remote host or network closed the connection unexpectedly.",
  network_unreachable: "The hosting runtime could not reach the sandbox network.",
  redirect_blocked: "The sandbox responded with an HTTP redirect. For security, the integration does not follow redirects with the API token.",
};

function GetTransferSandboxPreview() {
  const state = Route.useLoaderData();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quotePending, setQuotePending] = useState(false);
  const [routeId, setRouteId] = useState<string>("london");
  const [date, setDate] = useState(() => defaultPickupDate("Europe/London"));
  const [time, setTime] = useState("14:00");
  const [passengers, setPassengers] = useState(2);
  const [quote, setQuote] = useState<Quote | null>(null);

  const fieldStyle = "mt-1 block h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const selected = GETTRANSFER_PREVIEW_ROUTES.find((item) => item.id === routeId)!;

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await unlockGetTransferPreview({ data: { password } });
      setPassword("");
      if (result.kind === "authenticated") await router.invalidate();
      else if (result.kind === "rate_limited") setFeedback("Too many attempts. Please try again later.");
      else setFeedback("Access denied or preview unavailable.");
    } catch {
      setFeedback("Private preview sign-in is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await lockGetTransferPreview();
      setQuote(null);
      await router.invalidate();
    } finally { setBusy(false); }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quotePending) return;
    setQuotePending(true);
    setQuote(null);
    try {
      setQuote(await searchGetTransferPreview({
        data: { routeId, date, time, passengers },
      }));
    } catch {
      setQuote({ kind: "request_failed" });
    } finally { setQuotePending(false); }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-teal-soft/40 p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wider text-teal">
          Restricted integration test · GetTransfer · Sandbox only
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">GetTransfer — API price preview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Read-only requests to the provider's test environment. Prices shown here are
          returned by the sandbox API, not verified production fares or reservations.
          No customer checkout, affiliate links, or booking operations are enabled.
        </p>
      </header>

      {(state.kind === "disabled" || state.kind === "unconfigured") && (
        <div role="status" className="rounded-xl border bg-card p-5 text-sm">
          {state.kind === "disabled"
            ? "GetTransfer private preview is disabled until GETTRANSFER_SANDBOX_PREVIEW_ENABLED=true is configured on the hosting server."
            : "Sandbox token or private preview credentials are not configured. No provider API call has been made."}
        </div>
      )}

      {state.kind === "authentication_required" && (
        <form onSubmit={(event) => void signIn(event)} className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="size-5" aria-hidden /> Private preview login
          </h2>
          <p className="text-sm text-muted-foreground">
            Use the same private access password as the Intui and Alps2Alps previews.
            No GetTransfer request is sent before login and a manual search.
          </p>
          <label className="block text-sm font-medium" htmlFor="gettransfer-password">Preview access password</label>
          <input id="gettransfer-password" type="password" autoComplete="current-password"
            value={password} onChange={(event) => setPassword(event.target.value)}
            minLength={1} maxLength={512} required className={fieldStyle} />
          {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
          <button type="submit" disabled={busy || !password}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {busy ? "Checking…" : "Unlock private preview"}
          </button>
        </form>
      )}

      {state.kind === "authenticated" && (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={() => void signOut()} disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline disabled:opacity-50">
              <Lock className="size-4" aria-hidden /> Lock preview
            </button>
          </div>
          <form onSubmit={(event) => void search(event)} className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
            <h2 className="font-display text-lg font-bold">One-way airport transfer — sandbox search</h2>
            <p className="text-xs text-muted-foreground">
              Only predefined airport-to-city routes with verified coordinates.
              Date and time are local to the pickup location; the provider requires at least 6 hours' notice.
              A search calls only GET /api/route_info in the sandbox.
            </p>
            <label className="block text-sm font-semibold">
              Route
              <select value={routeId} onChange={(event) => {
                const id = event.target.value;
                const next = GETTRANSFER_PREVIEW_ROUTES.find((r) => r.id === id);
                if (!next) return;
                setRouteId(id);
                setDate(defaultPickupDate(getLocation(next.from)?.timeZone ?? "Europe/London"));
                setQuote(null);
              }} className={fieldStyle}>
                {GETTRANSFER_PREVIEW_ROUTES.map((route) => (
                  <option key={route.id} value={route.id}>
                    {getLocation(route.from)?.shortName} → {getLocation(route.to)?.shortName} ({route.currency})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Pickup date
                <input type="date" required value={date}
                  onChange={(event) => { setDate(event.target.value); setQuote(null); }}
                  className={fieldStyle} />
              </label>
              <label className="block text-sm font-semibold">
                Pickup time ({getLocation(selected.from)?.timeZone})
                <input type="time" required value={time}
                  onChange={(event) => { setTime(event.target.value); setQuote(null); }}
                  className={fieldStyle} />
              </label>
              <label className="block text-sm font-semibold">
                Passengers
                <select value={passengers}
                  onChange={(event) => { setPassengers(Number(event.target.value)); setQuote(null); }}
                  className={fieldStyle}>
                  {Array.from({ length: 16 }, (_, index) => index + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={quotePending}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {quotePending ? "Retrieving sandbox prices…" : "Search GetTransfer sandbox"}
            </button>
          </form>

          {quote?.kind === "ok" && (
            <section className="space-y-4" aria-labelledby="gettransfer-results">
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <strong>Sandbox response — not an offer to book.</strong>{" "}
                GetTransfer updates these prices periodically. No availability guarantee,
                vehicle details, final fees, luggage allowance, cancellation terms or booking link
                are verified by this endpoint. Only prices in the <code>book_now</code> field
                are displayed as immediate-price diagnostics. Lower minimums are merely indicative.
              </div>
              <div>
                <h2 id="gettransfer-results" className="font-display text-xl font-extrabold">
                  {quote.offers.length} vehicle categories · {quote.currency}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {quote.routeLabel} · Pickup: {quote.dateTo} · Retrieved: {new Date(quote.retrievedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                </p>
              </div>
              <div className="space-y-3">
                {[...quote.offers].sort((a, b) =>
                  a.price.minor - b.price.minor || a.type.localeCompare(b.type)
                ).map((offer) => (
                  <article key={offer.type} className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-900">
                          <CarFront className="size-5" aria-hidden />
                        </span>
                        <div>
                          <h3 className="font-display font-bold capitalize">
                            {offer.type.replace(/_/g, " ")}
                          </h3>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UsersRound className="size-4" aria-hidden />
                            Vehicle seating and luggage capacity not provided
                          </p>
                          {offer.indicativeMin && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Indicative minimum (not bookable): {offer.indicativeMin}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="sm:text-right">
                        <p className="font-display text-3xl font-extrabold tabular-nums">
                          {formatMoney(offer.price)}
                        </p>
                        <p className="text-xs text-muted-foreground">book_now · sandbox only</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {quote?.kind === "no_offers" && (
            <div role="status" className="rounded-xl border bg-card p-5 text-sm">
              GetTransfer returned no immediate sandbox prices (book_now) for this route and time.
            </div>
          )}
          {quote?.kind === "invalid" && (
            <div role="alert" className="rounded-xl border bg-card p-5 text-sm">
              Select a valid route, a nonambiguous local departure time at least 6 hours ahead,
              and 1–16 passengers. Times during daylight-saving transitions may be unavailable.
            </div>
          )}
          {quote?.kind === "rate_limited" && (
            <div role="alert" className="rounded-xl border bg-card p-5 text-sm">
              The private preview has reached its request limit. No provider call was sent.
            </div>
          )}
          {quote?.kind === "authentication_required" && (
            <div role="alert" className="rounded-xl border bg-card p-5 text-sm">
              Your private preview session expired. Lock the page and sign in again.
            </div>
          )}
          {(quote?.kind === "disabled" || quote?.kind === "unconfigured") && (
            <div role="status" className="rounded-xl border bg-card p-5 text-sm">
              The private preview is disabled or not configured.
            </div>
          )}
          {(quote?.kind === "error" || quote?.kind === "request_failed") && (
            <div role="alert" className="rounded-xl border bg-card p-5 text-sm">
              GetTransfer sandbox request did not complete.
              {" "}Diagnostic: <code>{quote.kind === "error" ? quote.code : "request_failed"}</code>.
              <p className="mt-1 text-xs text-muted-foreground">
                {quote.kind === "error" ? ERROR_LABELS[quote.code] ?? "Please retry later." : "Please retry later."}
                {" "}No credentials or provider response contents are exposed.
              </p>
            </div>
          )}
        </>
      )}
      <Link to="/search" className="inline-flex text-sm font-semibold text-primary underline">
        Return to fictional comparison demo
      </Link>
    </main>
  );
}
