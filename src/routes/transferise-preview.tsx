import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { KeyRound, Lock } from "lucide-react";
import { defaultPickupDate } from "@/domain/time";
import {
  TRANSFERISE_CURRENCIES, TRANSFERISE_PREVIEW_ROUTES, TRANSFERISE_TIME_ZONE,
  type TransferiseCurrency,
} from "@/providers/transferise/preview";
import { TransferisePreviewResults } from "@/components/transferise/TransferisePreviewResults";
import {
  getTransferisePreviewStatus, lockTransferisePreview,
  searchTransferisePreview, unlockTransferisePreview,
} from "@/search/transferise-preview.functions";

export const Route = createFileRoute("/transferise-preview")({
  loader: async () => getTransferisePreviewStatus(),
  head: () => ({ meta: [
    { title: "Transferise sandbox preview — AirportRideFinder" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: TransferisePreview,
});

type Quote = Awaited<ReturnType<typeof searchTransferisePreview>> | { kind: "request_failed" };
const ERRORS: Record<string, string> = {
  invalid_sandbox_key: "A Transferise sandbox key beginning tfx_test_ is required on the server.",
  unauthorized: "Transferise rejected the sandbox key (401).",
  forbidden: "Transferise denied this request (403). Check the key's domain settings.",
  rate_limited: "Transferise's request limit has been reached (429).",
  location_unresolved: "The requested place could not be verified. See the location diagnostic below.",
  malformed_response: "The API response could not be verified for this search.",
  api_rejected: "Transferise rejected this search. Try a later pickup or a different route.",
  invalid: "Choose a valid future pickup, route, currency and passenger count.",
  timeout: "Transferise did not respond before the timeout.",
  dns_error: "The hosting server could not resolve transferise.com.",
  tls_error: "The secure connection to Transferise failed.",
  redirect_blocked: "Transferise redirected the API request; no API key was forwarded.",
  network_error: "The connection failed before an API response was received.",
  http_error: "Transferise returned an unexpected HTTP response.",
};

function TransferisePreview() {
  const state = Route.useLoaderData();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [routeId, setRouteId] = useState("antalya-rixos");
  const [date, setDate] = useState(() => defaultPickupDate(TRANSFERISE_TIME_ZONE));
  const [time, setTime] = useState("14:00");
  const [passengers, setPassengers] = useState(2);
  const [currency, setCurrency] = useState<TransferiseCurrency>("EUR");
  const [quote, setQuote] = useState<Quote | null>(null);
  const field = "mt-1 block h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary";

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await unlockTransferisePreview({ data: { password } });
      setPassword("");
      if (result.kind === "authenticated") await router.invalidate();
      else setFeedback(result.kind === "rate_limited" ? "Too many attempts. Try again later." : "Access denied or preview unavailable.");
    } catch { setFeedback("Private preview sign-in is unavailable. Please retry."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setFeedback(null);
    try { await lockTransferisePreview(); setQuote(null); await router.invalidate(); }
    catch { setFeedback("Could not lock the preview. Please retry."); }
    finally { setBusy(false); }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setQuote(null);
    try { setQuote(await searchTransferisePreview({ data: { routeId, date, time, passengers, currency } })); }
    catch { setQuote({ kind: "request_failed" }); }
    finally { setPending(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-teal-soft/40 p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wider text-teal">Private integration test · Transferise · API check v4</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">Transferise — API price preview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sandbox quotes for one-way transfers in Türkiye. Prices come directly from the API.
          This preview creates no reservations and accepts no payments.
        </p>
      </header>

      {(state.kind === "disabled" || state.kind === "unconfigured") && (
        <div role="status" className="rounded-xl border bg-card p-5 text-sm">
          {state.kind === "disabled"
            ? "Transferise preview is disabled. Set TRANSFERISE_SANDBOX_PREVIEW_ENABLED=true on the hosting server."
            : "Configure TRANSFERISE_SANDBOX_API_KEY with a tfx_test_ key and the existing private preview credentials. No API request has been made."}
        </div>
      )}
      {state.kind === "authentication_required" && (
        <form onSubmit={(event) => void signIn(event)} className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><KeyRound className="size-5" aria-hidden /> Private preview login</h2>
          <p className="text-sm text-muted-foreground">Use the existing private preview password. The API is called only after a manual search.</p>
          <label className="block text-sm font-medium" htmlFor="transferise-password">Preview access password</label>
          <input id="transferise-password" type="password" autoComplete="current-password" required maxLength={512}
            value={password} onChange={(event) => setPassword(event.target.value)} className={field} />
          <button type="submit" disabled={busy || !password} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {busy ? "Checking…" : "Unlock private preview"}
          </button>
        </form>
      )}
      {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}

      {state.kind === "authenticated" && (
        <>
          <div className="flex justify-end"><button type="button" disabled={busy || pending} onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline disabled:opacity-50">
            <Lock className="size-4" aria-hidden /> Lock preview
          </button></div>
          <form onSubmit={(event) => void search(event)} className="rounded-xl border bg-card p-5 shadow-card">
            <fieldset disabled={pending || busy} className="space-y-4 disabled:opacity-70">
              <legend className="font-display text-lg font-bold">One-way transfer — sandbox search</legend>
              <label className="block text-sm font-semibold">Test route
                <select className={field} value={routeId} onChange={(event) => { setRouteId(event.target.value); setQuote(null); }}>
                  {TRANSFERISE_PREVIEW_ROUTES.map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block text-sm font-semibold">Pickup date
                  <input className={field} type="date" required value={date} onChange={(event) => { setDate(event.target.value); setQuote(null); }} />
                </label>
                <label className="block text-sm font-semibold">Pickup time (Türkiye)
                  <input className={field} type="time" required value={time} onChange={(event) => { setTime(event.target.value); setQuote(null); }} />
                </label>
                <label className="block text-sm font-semibold">Passengers
                  <select className={field} value={passengers} onChange={(event) => { setPassengers(Number(event.target.value)); setQuote(null); }}>
                    {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold">Currency
                  <select className={field} value={currency} onChange={(event) => { setCurrency(event.target.value as TransferiseCurrency); setQuote(null); }}>
                    {TRANSFERISE_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                  </select>
                </label>
              </div>
              <button type="submit" className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
                {pending ? "Retrieving sandbox prices…" : "Search Transferise sandbox"}
              </button>
            </fieldset>
          </form>
          <div aria-live="polite">
            {quote?.kind === "ok" && (
              <section className="space-y-4">
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  Sandbox response — for testing only. Prices are shown in the currency returned by Transferise, without added markup.
                  Any enabled booking link opens a test page, not a live checkout.
                </p>
                <p className="text-sm text-muted-foreground">
                  {quote.routeLabel} · {quote.date} {quote.time} (Türkiye) · {quote.passengers} passengers · {quote.currency}
                  <br />Retrieved: {new Date(quote.retrievedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
                </p>
                <TransferisePreviewResults offers={quote.offers} bookingUrl={quote.bookingUrl} />
              </section>
            )}
            {quote?.kind === "no_offers" && <p role="status" className="rounded-xl border bg-card p-5 text-sm">No matching per-vehicle prices were returned for this search.</p>}
            {quote?.kind === "invalid" && <p role="alert">Select a valid future pickup, route, currency and 1–16 passengers.</p>}
            {quote?.kind === "rate_limited" && <p role="alert">The preview request limit has been reached. Please try again later.</p>}
            {quote?.kind === "authentication_required" && <p role="alert">Your session expired. Lock the preview and sign in again.</p>}
            {(quote?.kind === "disabled" || quote?.kind === "unconfigured") && <p role="status">The preview is disabled or not configured.</p>}
            {quote?.kind === "error" && <div role="alert" className="space-y-3 rounded-xl border bg-card p-5 text-sm">
              <p>
                {ERRORS[quote.code] ?? "The sandbox connection could not be completed."} Diagnostic: <code>{quote.code}</code>
                {quote.request && <> · <code>{quote.request.stage}</code> · {quote.request.httpStatus !== null ? `HTTP ${quote.request.httpStatus}` : "No HTTP response"}
                  {quote.request.providerCode && <> · <code>{quote.request.providerCode}</code></>}
                </>}.
              </p>
              {quote.request && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border bg-muted/30 p-3 text-xs">
                <dt>Request stage</dt><dd>{quote.request.stage}</dd>
                <dt>HTTP status</dt><dd>{quote.request.httpStatus ?? "No response"}</dd>
                <dt>Provider error code</dt><dd>{quote.request.providerCode ?? "Not supplied"}</dd>
                {quote.request.fromId && <><dt>Pickup ID</dt><dd><code>{quote.request.fromId}</code></dd></>}
                {quote.request.toId && <><dt>Destination ID</dt><dd><code>{quote.request.toId}</code></dd></>}
                <dt>Documented hotel fallback</dt><dd>{quote.request.usedDocumentedId ? "Yes" : "No"}</dd>
              </dl>}
              {quote.location && <details open className="rounded-lg border bg-muted/30 p-3">
                <summary className="font-semibold">Location diagnostic (v4)</summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt>Stage</dt><dd>{quote.location.stage}</dd>
                  <dt>Search</dt><dd>{quote.location.query}</dd>
                  <dt>Reason</dt><dd><code>{quote.location.reason}</code></dd>
                  <dt>Results returned</dt><dd>{quote.location.returnedCount}</dd>
                  <dt>Exact matches</dt><dd>{quote.location.matchingCount}</dd>
                </dl>
                {quote.location.candidates.length > 0 && <ul className="mt-3 space-y-1 text-xs">
                  {quote.location.candidates.map((place, index) => <li key={`${place.id}-${index}`}>
                    {place.name} — <code>{place.id}</code> ({place.kind})
                  </li>)}
                </ul>}
                <p className="mt-2 text-xs text-muted-foreground">Only bounded place fields are shown; no API key, headers or raw response.</p>
              </details>}
            </div>}
            {quote?.kind === "request_failed" && <p role="alert">The preview request could not be completed. Please retry.</p>}
          </div>
        </>
      )}
      <Link to="/search" className="inline-flex text-sm font-semibold text-primary underline">Return to comparison demo</Link>
    </div>
  );
}


