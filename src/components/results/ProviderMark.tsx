import type { BrandToken, TransferProvider } from "@/domain/types";
import { cn } from "@/lib/utils";

const BG: Record<BrandToken, string> = {
  sky: "bg-brand-sky",
  aero: "bg-brand-aero",
  nest: "bg-brand-nest",
  blue: "bg-brand-blue",
};
const TEXT: Record<BrandToken, string> = {
  sky: "text-brand-sky",
  aero: "text-brand-aero",
  nest: "text-brand-nest",
  blue: "text-brand-blue",
};

export const providerTextClass = (p: TransferProvider) => TEXT[p.brand];

export function ProviderMark({ provider, className }: { provider: TransferProvider; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold text-on-brand",
        BG[provider.brand],
        className,
      )}
    >
      {provider.displayName[0]}
    </span>
  );
}
