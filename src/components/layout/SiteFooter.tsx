import { Info } from "lucide-react";
import { COPY } from "@/content/strings";

export function SiteFooter() {
  return (
    <footer className="mt-12 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          role="note"
          className="flex gap-3 rounded-xl border bg-secondary px-4 py-3 text-xs leading-relaxed text-secondary-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            <strong className="font-semibold">Demonstration preview.</strong> {COPY.demoFictional}{" "}
            {COPY.demoDisclaimer} AirportRideFinder is a comparison service, not a transfer operator.
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          AirportRideFinder · Phase 1 prototype
        </p>
      </div>
    </footer>
  );
}
