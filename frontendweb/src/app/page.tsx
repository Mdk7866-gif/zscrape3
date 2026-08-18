/**
 * Landing page.
 *
 * Server component. Everything that moves is a small client island
 * (HeroShowcase / Reveal / CountUp / SpotlightCard) so the page itself ships no
 * hooks and paints immediately while the sidebar fetches folders alongside it.
 *
 * Layout rule for this file: nothing may change size after hydration. Animated
 * elements only ever move `opacity` and `transform`, and the hero visual is
 * height-locked — so the page's CLS is 0.
 */

import Reveal from "@/components/Reveal";
import HeroShowcase from "@/components/home/HeroShowcase";
import CountUp from "@/components/home/CountUp";
import SpotlightCard from "@/components/home/SpotlightCard";
import PlatformBadge from "@/components/home/PlatformBadge";
import { APP_VERSION } from "@/lib/version";
import { PLATFORMS } from "@/lib/platforms";

const CHANGELOG = [
  {
    tag: "New",
    title: "Private admin workspace",
    body: "A password-gated workspace with its own folders and videos, completely invisible to normal users. Enter it from the Admin button in the navbar.",
  },
  {
    tag: "Fixed",
    title: "Full-quality YouTube downloads",
    body: "Large downloads no longer die partway with a 403, and quality is no longer silently capped at 360p. Verified on 1080p files over 100 MB.",
  },
  {
    tag: "Fixed",
    title: "Automatic retry when YouTube rate-limits",
    body: "“Sign in to confirm you're not a bot” is now caught and retried once with a signed-in session instead of failing the whole video.",
  },
  {
    tag: "Fixed",
    title: "Instagram & Facebook extraction",
    body: "Reels and posts resolve again, with thumbnails proxied around Meta's hotlink blocking.",
  },
  {
    tag: "Improved",
    title: "Smarter failed-URL list",
    body: "Failed URLs are deduplicated, and any URL that succeeds on retry disappears from the list right away instead of lingering as a false failure.",
  },
];

const STATS = [
  { value: 5, suffix: "×", label: "Parallel metadata workers" },
  { value: 50, suffix: "", label: "URLs per extraction batch" },
  { value: 6, suffix: "+", label: "Platforms supported" },
  { value: 0, suffix: "", label: "Re-encodes — remux only" },
];

const FEATURES = [
  {
    title: "Structured organization",
    body: "Group everything into folders from the sidebar — one per project, source, or playlist. Each folder tracks its own videos, failures, and download states independently.",
    icon: (
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    ),
  },
  {
    title: "AI URL extraction",
    body: "Paste a messy wall of text — chat exports, notes, half-broken links. GPT-4o pulls out every URL, drops duplicates, and interleaves platforms so the queue never bottlenecks on one site.",
    icon: (
      <>
        <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M18 16.5 18.8 19l2.2.8-2.2.9-.8 2.3-.9-2.3-2.2-.9 2.2-.8z" />
      </>
    ),
  },
  {
    title: "Parallel metadata fetch",
    body: "Bulk uploads resolve five URLs at a time and stream results back live, so you watch titles, durations, thumbnails, and file sizes land one by one instead of staring at a spinner.",
    icon: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />,
  },
  {
    title: "Best-quality downloads",
    body: "Highest available video and audio, remuxed into MP4 — never re-encoded, so nothing is lost to a second compression pass. Pick an output folder once and files save straight there.",
    icon: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
  },
  {
    title: "State that survives reloads",
    body: "Every video's status — fresh, pending, downloaded, cancelled, or failed — is persisted server-side. Refresh the tab or navigate away and the list looks exactly as you left it.",
    icon: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </>
    ),
  },
  {
    title: "Nothing fails silently",
    body: "URLs that can't be resolved are collected per folder with the reason available, so you can review and retry them in a batch instead of hunting for what went missing.",
    icon: (
      <>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
  },
];

const STEPS = [
  {
    n: 1,
    title: "Create a folder",
    body: "Use the sidebar to add one. It becomes the home for a batch of videos.",
  },
  {
    n: 2,
    title: "Paste your links",
    body: "Open the AI extractor, dump in your text, and confirm the URLs it found.",
  },
  {
    n: 3,
    title: "Queue the downloads",
    body: "Hit download on any video. Progress is live and the queue handles the rest.",
  },
];

const TAG_STYLES: Record<string, string> = {
  New: "bg-accent-soft text-accent border-accent-line",
  Fixed: "bg-ok-soft text-ok border-ok-line",
  Improved: "bg-warn-soft text-warn border-warn-line",
};

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
      {/* ================= Hero ================= */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <Reveal className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft py-1 pl-1 pr-3.5 text-xs font-semibold text-accent">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent to-accent-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              New
            </span>
            <span className="font-mono tracking-tight">{APP_VERSION}</span>
          </div>

          <h1 className="mt-5 text-[2.15rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.35rem]">
            Catalog and download video from{" "}
            <span className="text-gradient">anywhere on the web.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Paste messy text full of scattered links. zscrape extracts the URLs, pulls
            rich metadata for each one, and downloads the highest-quality file straight
            to your machine.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex items-center gap-2.5 rounded-xl border border-line bg-surface/80 px-4 py-3 text-sm font-medium shadow-sm backdrop-blur-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
                </svg>
              </span>
              <span>
                Create your first folder
                <span className="text-muted"> in the sidebar</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-subtle sm:max-w-[13rem]">
              On mobile, open it with the menu button at the top-left.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120} className="min-w-0">
          <HeroShowcase />
        </Reveal>
      </section>

      {/* ================= Stats ================= */}
      <Reveal
        as="section"
        delay={80}
        className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:mt-20 lg:grid-cols-4"
      >
        {STATS.map((s) => (
          <div key={s.label} className="bg-surface/85 px-4 py-5 text-center backdrop-blur-sm sm:px-5 sm:py-6">
            <p className="text-2xl font-extrabold tracking-tight text-gradient sm:text-3xl">
              <CountUp to={s.value} suffix={s.suffix} />
            </p>
            <p className="mt-1 text-[11px] font-medium leading-snug text-muted sm:text-xs">
              {s.label}
            </p>
          </div>
        ))}
      </Reveal>

      {/* ================= Platform marquee ================= */}
      <section className="mt-10 sm:mt-14" aria-label="Supported platforms">
        <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
          Works with
        </p>
        <div className="mask-fade-x overflow-hidden">
          {/* The list is duplicated so the -50% translation loops seamlessly. */}
          <ul className="flex w-max animate-marquee gap-3 pr-3">
            {[...PLATFORMS, ...PLATFORMS].map((p, i) => (
              <li
                key={`${p.name}-${i}`}
                aria-hidden={i >= PLATFORMS.length}
                className="flex items-center gap-2.5 whitespace-nowrap rounded-full border border-line bg-surface/70 py-1.5 pl-2 pr-4 text-sm font-medium backdrop-blur-sm"
              >
                <PlatformBadge platform={p} />
                {p.name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= Features ================= */}
      <section className="mt-16 sm:mt-24">
        <Reveal className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Everything it does
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted sm:text-base">
            Built for working through hundreds of links at a time without babysitting them.
          </p>
        </Reveal>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <SpotlightCard className="h-full p-6">
                <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-accent-line bg-accent-soft text-accent">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {f.icon}
                  </svg>
                </span>
                <h3 className="text-base font-bold tracking-tight sm:text-lg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ================= How it works ================= */}
      <section className="mt-16 sm:mt-24">
        <Reveal className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Three steps to your first download
          </h2>
        </Reveal>

        <div className="relative mt-10">
          {/* Connector line behind the cards, desktop only */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-accent-line to-transparent sm:block"
          />
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 110}>
                <div className="group relative h-full rounded-2xl border border-line bg-surface/85 p-6 pt-8 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent-line hover:shadow-xl hover:shadow-accent/10">
                  <span className="absolute -top-4 left-6 grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-sm font-black text-white shadow-lg shadow-accent/30 transition-transform duration-300 group-hover:scale-110">
                    {s.n}
                  </span>
                  <h3 className="text-base font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= What's new ================= */}
      <section className="mt-16 sm:mt-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface/85 p-6 backdrop-blur-sm sm:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/15 blur-3xl"
            />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
                  What&apos;s new in this update
                </h2>
                <p className="mt-1.5 text-sm text-muted">
                  Downloads got significantly more reliable, and admins got a workspace of their own.
                </p>
              </div>
              <span className="shrink-0 self-start rounded-full border border-line bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted sm:self-auto">
                {APP_VERSION}
              </span>
            </div>

            <ul className="relative mt-7 space-y-4">
              {CHANGELOG.map((item, i) => (
                <Reveal
                  as="li"
                  key={item.title}
                  delay={i * 70}
                  className="flex flex-col gap-1.5 border-b border-line pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
                >
                  <span
                    className={`w-fit shrink-0 rounded-md border px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wider sm:w-20 ${
                      TAG_STYLES[item.tag] ?? "border-line bg-surface-2 text-muted"
                    }`}
                  >
                    {item.tag}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{item.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ================= CTA ================= */}
      <Reveal as="section" className="mt-16 sm:mt-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-accent-2 to-accent-3 p-px">
          <div className="relative overflow-hidden rounded-[calc(1.5rem-1px)] bg-bg/85 px-6 py-10 text-center backdrop-blur-xl sm:px-12 sm:py-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-accent/25 blur-3xl animate-beam"
            />
            <h2 className="relative text-2xl font-extrabold tracking-tight sm:text-3xl">
              Ready to get started?
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted sm:text-base">
              Create a folder in the sidebar, paste your links, and let the queue do the rest.
            </p>
            <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-subtle">
              {["No re-encoding", "Resumable status", "Six platforms", "Live progress"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-line bg-surface/70 px-3 py-1.5 font-medium"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
