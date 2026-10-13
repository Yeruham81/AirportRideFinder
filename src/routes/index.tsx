import { createFileRoute } from "@tanstack/react-router";
import { Scale, ShieldCheck, ExternalLink } from "lucide-react";
import heroImage from "@/assets/hero-airport.jpg";
import { defaultFormValues, SearchForm } from "@/components/search/SearchForm";
import { DemoRouteLinks } from "@/components/results/StatusNotices";
import { COPY } from "@/content/strings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AirportRideFinder — Compare Airport Transfer Prices Worldwide" },
      { name: "description", content: "Compare airport transfer prices from independent providers in one search, then book directly with the provider you choose." },
      { property: "og:title", content: "AirportRideFinder — Compare Airport Transfer Prices" },
      { property: "og:description", content: "Search once and compare airport transfer offers from independent providers." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Index,
});

const POINTS = [
  { Icon: Scale, title: "Like-for-like comparison", body: "Offers are matched by route, group size and vehicle class." },
  { Icon: ShieldCheck, title: "Clear terms", body: "Cancellation and fee details are shown as providers supply them." },
  { Icon: ExternalLink, title: "Book with the provider", body: "You complete booking and payment on the provider's own site." },
];

function Index() {
  return (
    <>
      <section className="relative overflow-hidden">
        <img
          src={heroImage}
          alt=""
          width={1920}
          height={800}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-hero-fade" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pb-14">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal">
            <span className="size-1.5 rounded-full bg-teal" aria-hidden /> {COPY.heroEyebrow}
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-extrabold leading-tight text-foreground sm:text-5xl">
            {COPY.heroTitle}
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">{COPY.heroSubtitle}</p>
          <div className="mt-8">
            <SearchForm initial={defaultFormValues()} variant="hero" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6" aria-labelledby="demo-routes">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-card">
          <h2 id="demo-routes" className="font-display text-lg font-bold">Try a demonstration route</h2>
          <p className="mt-1 text-sm text-muted-foreground">{COPY.demoDisclaimer}</p>
          <DemoRouteLinks />
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {POINTS.map(({ Icon, title, body }) => (
            <li key={title} className="flex gap-3 rounded-xl border bg-card p-4 shadow-card">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
