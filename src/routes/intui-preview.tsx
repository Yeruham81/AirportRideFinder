import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getLocation } from "@/data/locations";
import { loadIntuiPreview, unlockIntuiPreview, lockIntuiPreview } from "@/search/intui-preview.functions";
import { parseSearchParams } from "@/search/validation";
import { INTUI_PREVIEW_MESSAGES } from "@/search/intui-preview-errors";
import { IntuiPreviewOfferResults } from "@/components/intui/IntuiPreviewOfferResults";

export const Route = createFileRoute("/intui-preview")({
  validateSearch: (raw: Record<string, unknown>) => parseSearchParams(raw),
  loaderDeps: ({ search }) => ({
    from: search.from ?? "", to: search.to ?? "",
    date: search.date ?? "", time: search.time ?? "",
    pax: search.pax ?? 0, bags: search.bags ?? 0,
  }),
  loader: async ({ deps }) => loadIntuiPreview({ data: deps }),
  head: () => ({
    meta: [
      { title: "Intui.travel read-only preview — AirportRideFinder" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Restricted read-only preview of Intui.travel quotes. Booking is unavailable.",
      },
    ],
  }),
  component: IntuiPreview,
  pendingComponent: () => <div className="mx-auto max-w-4xl p-8 text-sm text-muted-foreground">Checking Intui availability…</div>,
});

function IntuiPreview() {
  const loaderResult = Route.useLoaderData();
  const router = useRouter();
  const search = Route.useSearch();
  const searchKey = [
    search.from, search.to, search.date, search.time, search.pax, search.bags,
  ].join("|");
  const [retryState, setRetryState] = useState<{
    searchKey: string;
    result: typeof loaderResult;
  } | null>(null);
  const result = retryState?.searchKey === searchKey ? retryState.result : loaderResult;
  const [retryStatus, setRetryStatus] = useState<"idle" | "complete" | "failed">("idle");
  const [password, setPassword] = useState("");
  const [loginFeedback, setLoginFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setLoginFeedback(null);
    try {
      const outcome = await unlockIntuiPreview({ data: { password } });
      setPassword("");
      if (outcome.kind === "authenticated") {
        setRetryState(null);
        setRetryStatus("idle");
        await router.invalidate();
      } else if (outcome.kind === "rate_limited") {
        setLoginFeedback("Too many attempts. Please try again later.");
      } else {
        setLoginFeedback("Access denied. Check the preview access password.");
      }
    } catch {
      setLoginFeedback("Preview sign-in is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await lockIntuiPreview();
      setRetryState(null);
      setRetryStatus("idle");
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function retrySearch() {
    if (busy) return;
    setBusy(true);
    setRetryStatus("idle");
    try {
      // Call the same authenticated server function directly. Re-invalidating
      // an unchanged router loader may reuse its cached error response.
      const next = await loadIntuiPreview({
        data: {
          from: search.from ?? "",
          to: search.to ?? "",
          date: search.date ?? "",
          time: search.time ?? "",
          pax: search.pax ?? 0,
          bags: search.bags ?? 0,
        },
      });
      setRetryState({ searchKey, result: next });
      setRetryStatus("complete");
    } catch {
      setRetryStatus("failed");
    } finally {
      setBusy(false);
    }
  }
  const from = getLocation(search.from ?? "");
  const to = getLocation(search.to ?? "");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-teal">Private preview · Read only</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Intui.travel transfer offers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {from?.shortName ?? "Unknown pickup"} → {to?.shortName ?? "Unknown destination"}
          {search.date ? ` · ${search.date}` : ""}
          {search.time ? ` at ${search.time} local time` : ""}
        </p>
      </div>

      {result.kind === "disabled" && (
        <div role="status" className="rounded-lg border bg-card p-5 text-sm">
          This preview is disabled. The main comparison demo is unchanged. Enabling
          the preview requires explicit server-side configuration and access controls.
        </div>
      )}
      {result.kind === "authentication_required" && (
        <form onSubmit={(event) => void login(event)} className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-display text-lg font-semibold">Authorized preview access</h2>
          <p className="text-sm text-muted-foreground">
            This read-only preview requires a private access password.
            No Intui API request will be sent before authentication.
          </p>
          <label className="block text-sm font-medium" htmlFor="intui-preview-password">Preview access password</label>
          <input
            id="intui-preview-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3"
            minLength={1}
            maxLength={512}
            required
          />
          {loginFeedback && <p role="alert" className="text-sm text-destructive">{loginFeedback}</p>}
          <button type="submit" disabled={busy || !password} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Checking…" : "Unlock private preview"}
          </button>
        </form>
      )}
      {result.kind === "rate_limited" && (
        <div role="alert" className="rounded-lg border bg-card p-5 text-sm">
          Preview request limit reached. Try again later.
        </div>
      )}
      {result.kind === "unconfigured" && (
        <div role="status" className="rounded-lg border bg-card p-5 text-sm">
          Intui is not configured in this server environment. No provider request was sent.
        </div>
      )}
      {result.kind === "invalid" && (
        <div role="alert" className="rounded-lg border bg-card p-5 text-sm">
          Please provide valid pickup, destination, future local date and time,
          passengers and luggage in the URL parameters.
        </div>
      )}
      {result.kind === "error" && (
        <div role="alert" className="space-y-3 rounded-lg border bg-card p-5 text-sm">
          <p className="font-semibold">The Intui search could not be completed.</p>
          <p>{INTUI_PREVIEW_MESSAGES[result.code]}</p>
          <p className="text-xs text-muted-foreground">
            Diagnostic code: <code>{result.code}</code>. This code does not contain API keys,
            prices, booking links or provider response details.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void retrySearch()}
            className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-primary disabled:opacity-50"
          >
            {busy ? "Retrying Intui…" : "Retry this search"}
          </button>
          {retryStatus === "complete" && (
            <p role="status" className="text-xs text-muted-foreground">
              The latest retry completed. The diagnostic above is from that attempt.
            </p>
          )}
          {retryStatus === "failed" && (
            <p role="alert" className="text-xs text-destructive">
              Retry could not be submitted. Please refresh this page.
            </p>
          )}
        </div>
      )}
      {result.kind === "no_offers" && (
        <div role="status" className="rounded-lg border bg-card p-5 text-sm">
          Intui responded but found no transfers for this search.
        </div>
      )}
      {result.kind === "ok" && (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={() => void logout()} disabled={busy} className="text-sm font-medium text-primary underline disabled:opacity-50">
              Lock preview
            </button>
          </div>
          <div role="status" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            {result.offers.length} verified private-transfer price {result.offers.length === 1 ? "entry" : "entries"}.
            These are live provider amounts for this search, but fee inclusion and
            optional extras have not been confirmed. No booking links are enabled.
          </div>
          <IntuiPreviewOfferResults
            key={searchKey}
            offers={result.offers}
            searchedPassengers={search.pax ?? 1}
            searchedLuggage={search.bags ?? 0}
          />
        </>
      )}

      <Link to="/search" className="inline-flex text-sm font-semibold text-primary underline">
        Return to the sample comparison
      </Link>
    </main>
  );
}
