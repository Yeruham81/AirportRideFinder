import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CarFront, KeyRound, Lock } from "lucide-react";
import { getLocation } from "@/data/locations";
import { formatMoney } from "@/domain/money";
import { defaultPickupDate } from "@/domain/time";
import { GETTRANSFER_PREVIEW_ROUTES } from "@/providers/gettransfer/preview-query";
import {
  getGetTransferProductionPreviewStatus, unlockGetTransferProductionPreview,
  lockGetTransferProductionPreview, searchGetTransferProductionPreview,
} from "@/search/gettransfer-production-preview.functions";

export const Route = createFileRoute("/gettransfer-production-preview")({
  loader: async () => getGetTransferProductionPreviewStatus(),
  head: () => ({ meta: [
    { title: "GetTransfer production diagnostic — AirportRideFinder" },
    { name: "robots", content: "noindex, nofollow" },
    { name: "description", content: "Private, read-only GetTransfer production price diagnostic." },
  ] }),
  component: ProductionPreview,
});

type SearchResult = Awaited<ReturnType<typeof searchGetTransferProductionPreview>> |
  { kind: "request_failed" };

const ERRORS: Record<string, string> = {
  missing_token: "Production token is missing on the server.",
  unauthorized: "GetTransfer rejected the production token (401).",
  forbidden: "GetTransfer denied access (403).",
  rate_limited: "GetTransfer returned HTTP 429.",
  http_error: "GetTransfer returned an unexpected HTTP response.",
  malformed_response: "GetTransfer returned an unrecognized response.",
  timeout: "The GetTransfer production request timed out.",
  redirect_blocked: "The API returned a redirect, which was not followed.",
  dns_error: "The server could not resolve gettransfer.com.",
  tls_error: "TLS negotiation failed.",
  network_error: "The production network request failed.",
  connect_timeout: "The production connection timed out.",
  connection_refused: "The production connection was refused.",
  connection_reset: "The production connection was reset.",
  network_unreachable: "The production network could not be reached.",
};

function ProductionPreview() {
  const state = Route.useLoaderData();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [routeId, setRouteId] = useState<string>("london");
  const [date, setDate] = useState(() => defaultPickupDate("Europe/London"));
  const [time, setTime] = useState("14:00");
  const [passengers, setPassengers] = useState(2);
  const [result, setResult] = useState<SearchResult | null>(null);
  const field = "mt-1 block h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground";
  const selected = GETTRANSFER_PREVIEW_ROUTES.find((r) => r.id === routeId)!;

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await unlockGetTransferProductionPreview({ data: { password } });
      setPassword("");
      if (response.kind === "authenticated") await router.invalidate();
      else setFeedback(response.kind === "rate_limited"
        ? "Too many login attempts. Try again later."
        : "Access denied or preview unavailable.");
    } catch {
      setFeedback("The private preview login could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await lockGetTransferProductionPreview();
      setResult(null);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setResult(null);
    setPending(true);
    try {
      setResult(await searchGetTransferProductionPreview({
        data: { routeId, date, time, passengers },
      }));
    } catch {
      setResult({ kind: "request_failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-teal-soft/40 p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wider text-teal">Restricted integration test · GetTransfer · Production</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">GetTransfer — live API price diagnostics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Read-only results from the production API for integration verification.
          Minimum prices are marketing indications, not guaranteed bookable fares.
          No bookings, payments, customer redirects or public comparison are enabled.
        </p>
      </header>

      {(state.kind === "disabled" || state.kind === "unconfigured") && (
        <div role="status" className="rounded-xl border bg-card p-5 text-sm">
          {state.kind === "disabled"
            ? "Production preview is off. GETTRANSFER_PRODUCTION_PREVIEW_ENABLED=true is required for private testing."
            : "Configure the server-only production token and the shared private preview password/session secrets. No API call was sent."}
        </div>
      )}

      {state.kind === "authentication_required" && (
        <form onSubmit={(event) => void signIn(event)} className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="size-5" aria-hidden /> Private preview login
          </h2>
          <p className="text-sm text-muted-foreground">
            Sign in using the existing private preview password. A live API request is sent only after you search.
          </p>
          <label className="block text-sm font-semibold" htmlFor="gettransfer-production-password">
            Access password
          </label>
          <input id="gettransfer-production-password" type="password" autoComplete="current-password"
            maxLength={512} required value={password}
            onChange={(event) => setPassword(event.target.value)} className={field} />
          <button type="submit" disabled={busy || !password}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? "Checking…" : "Unlock production preview"}
          </button>
        </form>
      )}
      {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}

      {state.kind === "authenticated" && (
        <>
          <div className="flex justify-end">
            <button type="button" disabled={busy || pending} onClick={() => void signOut()}
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline">
              <Lock className="size-4" aria-hidden /> Lock preview
            </button>
          </div>
          <form onSubmit={(event) => void search(event)} className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="font-display text-lg font-bold">One-way airport transfer — production test</h2>
            <p className="text-xs text-muted-foreground">
              Three predefined routes only. Pickup time is local to the airport and must be at least 6 hours ahead.
            </p>
            <label className="block text-sm font-semibold">
              Route
              <select value={routeId} className={field} onChange={(event) => {
                const route = GETTRANSFER_PREVIEW_ROUTES.find((r) => r.id === event.target.value);
                if (!route) return;
                setRouteId(route.id);
                setDate(defaultPickupDate(getLocation(route.from)?.timeZone ?? "Europe/London"));
                setResult(null);
              }}>
                {GETTRANSFER_PREVIEW_ROUTES.map((route) => (
                  <option value={route.id} key={route.id}>
                    {getLocation(route.from)?.shortName} → {getLocation(route.to)?.shortName} ({route.currency})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-semibold">Pickup date
                <input type="date" required value={date} className={field}
                  onChange={(event) => { setDate(event.target.value); setResult(null); }} />
              </label>
              <label className="block text-sm font-semibold">
                Pickup time ({getLocation(selected.from)?.timeZone})
                <input type="time" required value={time} className={field}
                  onChange={(event) => { setTime(event.target.value); setResult(null); }} />
              </label>
              <label className="block text-sm font-semibold">Passengers
                <select value={passengers} className={field}
                  onChange={(event) => { setPassengers(Number(event.target.value)); setResult(null); }}>
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                    <option value={n} key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={busy || pending}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {pending ? "Retrieving production prices…" : "Check production prices"}
            </button>
          </form>
          {result?.kind === "ok" && (
            <section className="space-y-4">
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Live API diagnostic, not a checkout page. Indicative minimums may be far below
                actual booking prices. A Book Now price is API pricing information only;
                this preview does not allow bookings.
              </p>
              <p className="text-sm text-muted-foreground">
                {result.routeLabel} · {result.dateTo} · Retrieved: {new Date(result.retrievedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
              </p>
              <h2 className="font-display text-xl font-bold">
                {result.offers.length} categories · {result.currency}
              </h2>
              <div className="space-y-3">
                {result.offers.map((offer) => (
                  <article key={offer.type} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <CarFront className="size-5 text-primary" aria-hidden />
                      <div>
                        <h3 className="font-display font-semibold capitalize">{offer.type.replace(/_/g, " ")}</h3>
                        <p className="text-xs text-muted-foreground">Vehicle seating and luggage allowance not verified</p>
                      </div>
                    </div>
                    <div className="text-sm sm:text-right">
                      {offer.indicativeMin && <p>From {offer.indicativeMin} <span className="text-xs text-muted-foreground">· indicative only</span></p>}
                      {offer.bookNow
                        ? <p className="font-semibold">Book Now API price: {formatMoney(offer.bookNow)}</p>
                        : <p className="text-xs text-muted-foreground">No immediate Book Now price returned</p>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {result?.kind === "no_offers" && (
            <p role="status" className="rounded-xl border bg-card p-5 text-sm">
              GetTransfer returned no usable minimum or Book Now prices for this search.
            </p>
          )}
          {result?.kind === "invalid" && (
            <p role="alert" className="rounded-xl border bg-card p-5 text-sm">
              Choose a supported route, valid local pickup at least six hours ahead, and 1–16 passengers.
            </p>
          )}
          {result?.kind === "rate_limited" && (
            <p role="alert" className="rounded-xl border bg-card p-5 text-sm">
              The private search limit has been reached.
            </p>
          )}
          {result?.kind === "authentication_required" && (
            <p role="alert">Your private session expired. Sign in again.</p>
          )}
          {(result?.kind === "disabled" || result?.kind === "unconfigured") && (
            <p role="status">Production preview is disabled or not configured.</p>
          )}
          {result?.kind === "error" && (
            <p role="alert" className="rounded-xl border bg-card p-5 text-sm">
              {ERRORS[result.code] ?? "The production request could not be completed."}
              {" "}Diagnostic: <code>{result.code}</code>. No provider response body or token is exposed.
            </p>
          )}
          {result?.kind === "request_failed" && (
            <p role="alert">The request could not be completed. Try again.</p>
          )}
        </>
      )}
      <Link to="/search" className="text-sm font-semibold text-primary underline">
        Return to comparison demo
      </Link>
    </main>
  );
}
