import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { CancellationFilter, CategoryFilter } from "@/search/compare";
import type { ComparisonViewModel } from "@/search/view-model";

const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-input bg-surface px-3 pr-9 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25";

function SelectBox({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative">
      <select {...props} className={selectCls}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

export function FilterPanel({
  vm,
  onCategory,
  onCancellation,
  onReset,
}: {
  vm: ComparisonViewModel;
  onCategory: (c: CategoryFilter) => void;
  onCancellation: (c: CancellationFilter) => void;
  onReset: () => void;
}) {
  const uid = useId();
  const isDefault = vm.state.category === "auto" && vm.state.cancellation === "all";
  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${uid}-cat`} className="mb-1.5 block text-xs font-semibold text-foreground">Vehicle class</label>
        <SelectBox id={`${uid}-cat`} value={vm.state.category} onChange={(e) => onCategory(e.target.value as CategoryFilter)}>
          {vm.categoryOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
          ))}
        </SelectBox>
        <p className="mt-1.5 text-xs text-muted-foreground">Offers are matched to a common vehicle class. Each provider's own wording is shown on the card.</p>
      </div>
      <div>
        <label htmlFor={`${uid}-cxl`} className="mb-1.5 block text-xs font-semibold text-foreground">Cancellation policy</label>
        <SelectBox id={`${uid}-cxl`} value={vm.state.cancellation} onChange={(e) => onCancellation(e.target.value as CancellationFilter)}>
          {vm.cancellationOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
          ))}
        </SelectBox>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-foreground">Currency</p>
        <p className="rounded-lg border border-dashed bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          {vm.currency ? `${vm.currency} — sample prices for this route` : "—"}
        </p>
      </div>
      <button
        type="button"
        onClick={onReset}
        disabled={isDefault}
        className="h-11 w-full rounded-lg border border-primary/40 bg-surface text-sm font-semibold text-primary transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset filters
      </button>
    </div>
  );
}
