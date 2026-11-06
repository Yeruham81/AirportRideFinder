import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CarFront, KeyRound, Lock, Luggage, UsersRound } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { defaultPickupDate } from "@/domain/time";
import { AlpsPublicQuotePanel } from "@/components/alps/AlpsPublicQuotePanel";
import { ALPS_PREVIEW_ROUTE } from "@/providers/alps2alps/sandbox-quote";
import {
  getAlpsSandboxStatus, lockAlpsSandbox, searchAlpsSandbox, unlockAlpsSandbox,
} from "@/search/alps-sandbox.functions";

export const Route = createFileRoute("/alps-preview")({
  loader: async () => getAlpsSandboxStatus(),
  head: () => ({
    meta: [
      { title: "Alps2Alps private sandbox preview — AirportRideFinder" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Private Alps2Alps sandbox diagnostics. No real bookings." },
    ],
  }),
  component: AlpsSandboxPreview,
});

type QuoteResult = Awaited<ReturnType<typeof searchAlpsSandbox>> | { kind: "request_failed" };

const ALPS_STAGE_LABEL = {
  token: "API authentication (POST /token)",
  vehicles: "Vehicle catalog (GET /vehicles)",
  transfer: "Transfer quote (POST /transfer)",
} as const;

function AlpsSandboxPreview() {
  const router = useRouter();
  const state = Route.useLoaderData();
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => defaultPickupDate("Europe/Zurich"));
  const [time, setTime] = useState("14:00");
  const [passengers, setPassengers] = useState(2);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quotePending, setQuotePending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await unlockAlpsSandbox({ data: { password } });
      setPassword("");
      if (result.kind === "authenticated") await router.invalidate();
      else if (result.kind === "rate_limited") setFeedback("Too many attempts. Please try again later.");
      else setFeedback("Preview access denied. Check the existing preview password.");
    } catch {
      setFeedback("Preview sign-in is temporarily unavailable.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await lockAlpsSandbox();
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
      setQuote(await searchAlpsSandbox({ data: { date, time, passengers } }));
    } catch {
      setQuote({ kind: "request_failed" });
    } finally { setQuotePending(false); }
  }

  const fieldStyle = "mt-1 block h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-teal-soft/40 p-6 shadow-card">
        <p className="text-xs font-bold uppercase tracking-wider text-teal">Restricted integration test · Alps2Alps · Not a public booking page</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">Alps2Alps — API integration preview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A separate development-only preview for testing the Amitours B2B API v2.
          No bookings, payment operations, affiliate redirects, or public search integration.
        </p>
      </header>

      {(state.kind === "disabled" || state.kind === "unconfigured") && (
        <div role="status" className="rounded-xl border bg-card p-5 text-sm">
          {state.kind === "disabled"
            ? "Sandbox preview is disabled until ALPS2ALPS_SANDBOX_PREVIEW_ENABLED=true is configured on the hosting server."
            : "Private preview access settings are not configured. No sandbox API calls have been made."}
        </div>
      )}

      {state.kind === "authentication_required" && (
        <form onSubmit={(event) => void signIn(event)} className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="size-5" aria-hidden /> Private preview login
          </h2>
          <p className="text-sm text-muted-foreground">
            Use the existing Intui preview access password. API keys are never entered here.
            Logging in does not trigger any provider API request.
          </p>
          <label className="block text-sm font-medium" htmlFor="alps-password">Preview access password</label>
          <input id="alps-password" type="password" autoComplete="current-password"
            value={password} onChange={(event) => setPassword(event.target.value)}
            required maxLength={512} className={fieldStyle} />
          {feedback && <p role="alert" className="text-sm text-destructive">{feedback}</p>}
          <button type="submit" disabled={busy || !password}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {busy ? "Checking…" : "Unlock sandbox"}
          </button>
        </form>
      )}

      {state.kind === "authenticated" && (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={() => void signOut()} disabled={busy}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline disabled:opacity-50">
              <Lock className="size-4" aria-hidden /> Lock sandbox preview
            </button>
          </div>
          <AlpsPublicQuotePanel />
          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            <strong>Amitours B2B Sandbox — separate legacy diagnostic.</strong>{" "}
            Its POST /token connection may fail in this hosting environment.
            Public API tests above do not require these B2B keys.
          </div>
          <form onSubmit={(event) => void search(event)} className="rounded-xl border bg-card p-5 shadow-card">
            <h2 className="font-display text-lg font-bold">One-way private transfer — test route</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {ALPS_PREVIEW_ROUTE.originLabel} ({ALPS_PREVIEW_ROUTE.from}) →{" "}
              {ALPS_PREVIEW_ROUTE.destinationLabel} ({ALPS_PREVIEW_ROUTE.to})
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Initial controlled test route. A quote request creates a sandbox transfer request,
              not a booking. No provider API call is made until you select Search sandbox quotes.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-semibold">
                Pickup date (Geneva local)
                <input type="date" required value={date}
                  onChange={(event) => { setDate(event.target.value); setQuote(null); }}
                  className={fieldStyle} />
              </label>
              <label className="block text-sm font-semibold">
                Pickup time (Geneva local)
                <input type="time" required value={time}
                  onChange={(event) => { setTime(event.target.value); setQuote(null); }}
                  className={fieldStyle} />
              </label>
              <label className="block text-sm font-semibold">
                Adults
                <select value={passengers}
                  onChange={(event) => { setPassengers(Number(event.target.value)); setQuote(null); }}
                  className={fieldStyle}>
                  {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" disabled={quotePending}
              className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {quotePending ? "Checking sandbox…" : "Search sandbox quotes"}
            </button>
          </form>

          {quote?.kind === "ok" && (
            <section aria-labelledby="alps-quote-heading" className="space-y-3">
              <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <strong>{quote.offers.length} sandbox price {quote.offers.length === 1 ? "entry" : "entries"}.</strong>
                {" "}These are TEST values, not verified customer-facing production prices.
                Final charges, luggage allowances, cancellation terms and affiliate attribution
                have not been confirmed.
                {quote.vehicleCatalog === "unavailable" && (
                  <p className="mt-2 text-xs font-medium">
                    Vehicle catalog could not be retrieved. Capacity and vehicle descriptions may be incomplete.
                  </p>
                )}
              </div>
              <h2 id="alps-quote-heading" className="font-display text-xl font-extrabold">
                Quoted vehicles · EUR
              </h2>
              <div className="space-y-3">
                {quote.offers.map((offer) => (
                  <article key={offer.id} className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-900">
                          <CarFront className="size-5" aria-hidden />
                        </span>
                        <div>
                          <h3 className="font-display font-bold">{offer.vehicleLabel}</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UsersRound className="size-4" aria-hidden />
                            {offer.maxPassengers === null ? "Vehicle capacity unverified" : `Up to ${offer.maxPassengers} people`}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Luggage className="size-4" aria-hidden /> Luggage allowance unconfirmed
                          </p>
                          {offer.pickupTime && (
                            <p className="mt-1 text-xs text-muted-foreground">Pickup: {offer.pickupTime} (local)</p>
                          )}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-display text-3xl font-extrabold tabular-nums">
                          {formatMoney(offer.price)}
                        </p>
                        <p className="text-xs text-muted-foreground">Sandbox quote · No booking enabled</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {quote.omitted > 0 && <p className="text-xs text-muted-foreground">
                {quote.omitted} malformed requested-time {quote.omitted === 1 ? "offer was" : "offers were"} omitted.
              </p>}
            </section>
          )}

          {quote?.kind === "no_offers" && (
            <div role="status" className="rounded-xl border bg-card p-4 text-sm">
              No requested-time private-transfer quotes were returned for these sandbox parameters.
            </div>
          )}
          {quote?.kind === "invalid" && (
            <div role="alert" className="rounded-xl border bg-card p-4 text-sm">
              Choose a future date and valid pickup time (Geneva local), with 1–16 adults.
            </div>
          )}
          {quote?.kind === "rate_limited" && (
            <div role="alert" className="rounded-xl border bg-card p-4 text-sm">
              Sandbox preview request limit reached. No further provider requests will be sent for now.
            </div>
          )}
          {quote?.kind === "authentication_required" && (
            <div role="alert" className="rounded-xl border bg-card p-4 text-sm">
              Preview session expired. Lock the page and sign in again.
            </div>
          )}
          {(quote?.kind === "error" || quote?.kind === "request_failed") && (
            <div role="alert" className="rounded-xl border bg-card p-4 text-sm">
              Sandbox API request could not be completed. Diagnostic code:{" "}
              <code>{quote.kind === "request_failed" ? "request_failed" : quote.code}</code>.
              {quote.kind === "error" && quote.stage && (
                <p className="mt-2 text-sm">
                  Failed step: <strong>{ALPS_STAGE_LABEL[quote.stage]}</strong>.
                  {quote.code === "network_error" &&
                    " The request received no usable HTTP response. Check sandbox hostname availability, DNS/TLS and hosting outbound connectivity."}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Diagnostic labels do not contain credentials, tokens or raw provider responses.
              </p>
            </div>
          )}
          {(quote?.kind === "disabled" || quote?.kind === "unconfigured") && (
            <div role="status" className="rounded-xl border bg-card p-4 text-sm">
              Sandbox access is not configured or enabled on the hosting server.
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
