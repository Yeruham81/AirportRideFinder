import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { ResultsSkeleton, ResultsView } from "@/components/results/ResultsView";
import { defaultFormValues, SearchForm, type SearchFormValues } from "@/components/search/SearchForm";
import { DEFAULT_STATE, parseComparisonState } from "@/search/compare";
import { searchTransfers } from "@/search/orchestrator";
import { buildRequest, parseDemoFail, parseSearchParams, type SearchParams } from "@/search/validation";
import { buildViewModel } from "@/search/view-model";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>): SearchParams => parseSearchParams(s),
  loaderDeps: ({ search }) => ({
    from: search.from,
    to: search.to,
    date: search.date,
    time: search.time,
    pax: search.pax,
    bags: search.bags,
    demoFail: search.demoFail,
  }),
  loader: async ({ deps }) => {
    const built = buildRequest(deps);
    if (!built.ok) return { kind: "invalid" as const, errors: built.errors };
    const response = await searchTransfers(built.request, {
      simulate: parseDemoFail(deps.demoFail),
      // Small artificial latency in the browser so the loading state is visible.
      delayMs: typeof window === "undefined" ? 0 : 350,
      timeoutMs: 1500,
    });
    return { kind: "ok" as const, response };
  },
  pendingMs: 150,
  pendingComponent: SearchPending,
  head: () => ({
    meta: [
      { title: "Compare transfer offers — AirportRideFinder (sample results)" },
      { name: "description", content: "Side-by-side comparison of sample airport transfer offers from fictional demonstration providers." },
      { property: "og:title", content: "Compare transfer offers — AirportRideFinder" },
      { property: "og:description", content: "Side-by-side comparison of sample airport transfer offers." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SearchPage,
  errorComponent: SearchError,
});

function formValuesFrom(s: SearchParams): SearchFormValues {
  const d = defaultFormValues();
  return {
    from: s.from ?? d.from,
    to: s.to ?? d.to,
    date: s.date ?? d.date,
    time: s.time ?? d.time,
    pax: s.pax ?? d.pax,
    bags: s.bags ?? d.bags,
  };
}

function CompactHeader({ search, errors }: { search: SearchParams; errors?: Record<string, string> }) {
  const key = [search.from, search.to, search.date, search.time, search.pax, search.bags].join("|");
  return (
    <div className="border-b bg-secondary/60">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <SearchForm key={key} variant="compact" initial={formValuesFrom(search)} initialErrors={errors} />
      </div>
    </div>
  );
}

function SearchPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const state = parseComparisonState(search);

  const vm = useMemo(
    () => (data.kind === "ok" ? buildViewModel(data.response, state) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, state.category, state.cancellation, state.sort],
  );

  const update = (patch: Partial<SearchParams>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true, resetScroll: false });

  return (
    <>
      <CompactHeader search={search} errors={data.kind === "invalid" ? data.errors : undefined} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {data.kind === "invalid" || !vm ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
            <h1 className="font-display text-lg font-bold">Check your search details</h1>
            <p className="mt-1 text-sm text-muted-foreground">Some details are missing or invalid. Please correct the highlighted fields above.</p>
          </div>
        ) : (
          <ResultsView
            vm={vm}
            handlers={{
              onCategory: (cat) => update({ cat: cat === DEFAULT_STATE.category ? undefined : cat }),
              onCancellation: (cxl) => update({ cxl: cxl === DEFAULT_STATE.cancellation ? undefined : cxl }),
              onSort: (sort) => update({ sort: sort === DEFAULT_STATE.sort ? undefined : sort }),
              onReset: () => update({ cat: undefined, cxl: undefined }),
              onRetry: () => router.invalidate(),
            }}
          />
        )}
      </div>
    </>
  );
}

function SearchPending() {
  const search = Route.useSearch();
  return (
    <>
      <CompactHeader search={search} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <ResultsSkeleton />
      </div>
    </>
  );
}

function SearchError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden />
      <h1 className="mt-3 font-display text-lg font-bold">The comparison couldn't be loaded</h1>
      <p className="mt-1 text-sm text-muted-foreground">Something went wrong while comparing providers.</p>
      <button
        type="button"
        onClick={() => { router.invalidate(); reset(); }}
        className="mt-5 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
