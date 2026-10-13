import { Link } from "@tanstack/react-router";
import { Plane } from "lucide-react";
import { COPY } from "@/content/strings";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px]">
        <Link to="/" className="flex items-center gap-3" aria-label="AirportRideFinder home">
          <span className="flex size-10 items-center justify-center rounded-xl bg-teal-soft text-teal">
            <Plane className="size-5 -rotate-45" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-xl font-extrabold tracking-tight text-foreground">
              Airport<span className="text-primary">RideFinder</span>
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">{COPY.brandTagline}</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4" aria-label="Main">
          <Link
            to="/"
            className="hidden text-sm font-semibold text-primary sm:inline"
            activeOptions={{ exact: true }}
          >
            Compare Transfers
          </Link>
          <span className="rounded-full border border-teal/30 bg-teal-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal">
            Demo · sample data
          </span>
        </nav>
      </div>
    </header>
  );
}
