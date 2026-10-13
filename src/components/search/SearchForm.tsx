import { useNavigate } from "@tanstack/react-router";
import { Briefcase, CalendarDays, Clock, MapPin, Pencil, Plane, Search, Users } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { getLocation, LOCATIONS } from "@/data/locations";
import { defaultPickupDate, formatLocalDate, todayInTimeZone } from "@/domain/time";
import { cn } from "@/lib/utils";
import { buildRequest, MAX_LUGGAGE, MAX_PASSENGERS, type FieldErrors } from "@/search/validation";

export interface SearchFormValues {
  from: string;
  to: string;
  date: string;
  time: string;
  pax: number;
  bags: number;
}

export function defaultFormValues(now = new Date()): SearchFormValues {
  return { from: "lhr", to: "central-london", date: defaultPickupDate("Europe/London", now), time: "10:00", pax: 2, bags: 2 };
}

const airports = LOCATIONS.filter((l) => l.type === "airport");
const places = LOCATIONS.filter((l) => l.type !== "airport");

function Field({ label, error, htmlFor, children, className }: { label: string; error?: string | undefined; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${htmlFor}-err`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-surface pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25 aria-[invalid=true]:border-destructive";

function IconWrap({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary [&_svg]:size-4">{icon}</span>
      {children}
    </div>
  );
}

function LocationOptions() {
  return (
    <>
      <optgroup label="Airports">
        {airports.map((l) => (
          <option key={l.id} value={l.id}>{l.displayName}</option>
        ))}
      </optgroup>
      <optgroup label="City areas">
        {places.map((l) => (
          <option key={l.id} value={l.id}>{l.displayName}</option>
        ))}
      </optgroup>
    </>
  );
}

export function SearchForm({
  initial,
  variant = "hero",
  initialErrors,
}: {
  initial: SearchFormValues;
  variant?: "hero" | "compact";
  initialErrors?: FieldErrors | undefined;
}) {
  const navigate = useNavigate();
  const id = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>(initialErrors ?? {});
  const [open, setOpen] = useState(variant === "hero" || !!initialErrors);
  const pickup = getLocation(v.from);
  const minDate = pickup ? todayInTimeZone(pickup.timeZone) : undefined;

  const set = <K extends keyof SearchFormValues>(k: K, val: SearchFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = buildRequest(v);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    navigate({ to: "/search", search: { ...v } });
  }

  const summary = (
    <div className="flex items-center justify-between gap-3 md:hidden">
      <div className="min-w-0 text-sm">
        <p className="truncate font-semibold text-foreground">
          {getLocation(initial.from)?.shortName} → {getLocation(initial.to)?.shortName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatLocalDate(initial.date)}, {initial.time} · {initial.pax} pax · {initial.bags} bags
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-form`}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-sm font-semibold text-primary"
      >
        <Pencil className="size-4" aria-hidden /> {open ? "Close" : "Edit search"}
      </button>
    </div>
  );

  return (
    <div className={cn("rounded-2xl border bg-surface", variant === "hero" ? "p-4 shadow-float sm:p-5" : "p-3 shadow-card sm:p-4")}>
      {variant === "compact" && summary}
      <form
        id={`${id}-form`}
        onSubmit={submit}
        noValidate
        aria-label="Search airport transfers"
        className={cn(
          "grid grid-cols-2 gap-3 md:grid-cols-4 md:items-start xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_146px_136px_128px_112px_auto] xl:gap-2.5",
          variant === "compact" && !open && "hidden md:grid",
          variant === "compact" && open && "mt-3 md:mt-0",
        )}
      >
        <Field label="Pickup location" htmlFor={`${id}-from`} error={errors.from} className="col-span-2 xl:col-span-1">
          <IconWrap icon={<Plane className="-rotate-45" />}>
            <select id={`${id}-from`} className={control} value={v.from} onChange={(e) => set("from", e.target.value)} aria-invalid={!!errors.from}>
              <LocationOptions />
            </select>
          </IconWrap>
        </Field>
        <Field label="Drop-off destination" htmlFor={`${id}-to`} error={errors.to} className="col-span-2 xl:col-span-1">
          <IconWrap icon={<MapPin />}>
            <select id={`${id}-to`} className={control} value={v.to} onChange={(e) => set("to", e.target.value)} aria-invalid={!!errors.to}>
              <LocationOptions />
            </select>
          </IconWrap>
        </Field>
        <Field label="Pickup date" htmlFor={`${id}-date`} error={errors.date}>
          <IconWrap icon={<CalendarDays />}>
            <input id={`${id}-date`} type="date" className={control} value={v.date} min={minDate} onChange={(e) => set("date", e.target.value)} aria-invalid={!!errors.date} required />
          </IconWrap>
        </Field>
        <Field label="Pickup time (local)" htmlFor={`${id}-time`} error={errors.time}>
          <IconWrap icon={<Clock />}>
            <input id={`${id}-time`} type="time" className={control} value={v.time} onChange={(e) => set("time", e.target.value)} aria-invalid={!!errors.time} required />
          </IconWrap>
        </Field>
        <Field label="Passengers" htmlFor={`${id}-pax`} error={errors.pax}>
          <IconWrap icon={<Users />}>
            <select id={`${id}-pax`} className={control} value={v.pax} onChange={(e) => set("pax", Number(e.target.value))}>
              {Array.from({ length: MAX_PASSENGERS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? "person" : "people"}</option>
              ))}
            </select>
          </IconWrap>
        </Field>
        <Field label="Luggage" htmlFor={`${id}-bags`} error={errors.bags}>
          <IconWrap icon={<Briefcase />}>
            <select id={`${id}-bags`} className={control} value={v.bags} onChange={(e) => set("bags", Number(e.target.value))}>
              {Array.from({ length: MAX_LUGGAGE + 1 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? "bag" : "bags"}</option>
              ))}
            </select>
          </IconWrap>
        </Field>
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-4 md:items-end xl:col-span-1 xl:items-stretch">
          <span className="hidden text-xs font-semibold xl:block" aria-hidden>&nbsp;</span>
          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 md:w-auto md:min-w-48 xl:w-full xl:min-w-0 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Search className="size-4" aria-hidden />
            {variant === "compact" ? (<><span className="xl:hidden">Update search</span><span className="hidden xl:inline">Search</span></>) : "Search Transfers"}
          </button>
        </div>
      </form>
    </div>
  );
}
