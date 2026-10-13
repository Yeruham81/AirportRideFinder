import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeCancellation } from "@/domain/cancellation";
import { formatMoney } from "@/domain/money";
import { CATEGORY_LABEL } from "@/domain/vehicle-taxonomy";
import { resolveBookingLink, type BookingLinkResolution } from "@/redirect/redirect";
import type { OfferCardModel } from "@/search/view-model";
import { feeLabel, priceLabel } from "@/components/results/format";

export function ViewDealDialog({ model, onClose }: { model: OfferCardModel | null; onClose: () => void }) {
  const [resolution, setResolution] = useState<BookingLinkResolution | null>(null);
  useEffect(() => {
    setResolution(null);
    if (model) void resolveBookingLink(model.offer).then(setResolution);
  }, [model]);

  return (
    <Dialog open={!!model} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {model && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">Continue to {model.provider.displayName}</DialogTitle>
              <DialogDescription>
                Demonstration only — no booking is made and you will not leave this preview.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted p-3 text-sm">
              <dt className="text-muted-foreground">Vehicle</dt>
              <dd className="font-medium">{CATEGORY_LABEL[model.offer.category]}</dd>
              <dt className="text-muted-foreground">{priceLabel(model.offer.price.taxesAndFees)}</dt>
              <dd className="font-medium">{formatMoney(model.offer.price.quotedPrice)} <span className="text-xs text-muted-foreground">({feeLabel(model.offer.price.taxesAndFees)})</span></dd>
              <dt className="text-muted-foreground">Cancellation</dt>
              <dd className="font-medium">{describeCancellation(model.offer.cancellation).headline}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              {resolution?.kind === "demo" ? resolution.message : "Preparing…"}
            </p>
            <DialogFooter>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="size-4" aria-hidden /> Got it
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
