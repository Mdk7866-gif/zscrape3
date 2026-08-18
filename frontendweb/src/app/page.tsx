/**
 * Landing page. Static server component — no hooks, so it renders instantly
 * while the sidebar fetches folders alongside it.
 *
 * Keep APP_VERSION in sync with the badge in components/Navbar.tsx.
 */

const APP_VERSION = "18.08.2026V2";

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
    body: "\"Sign in to confirm you're not a bot\" is now caught and retried once with a signed-in session instead of failing the whole video.",
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

const FEATURES = [
  {
    icon: "📁",
    title: "Structured organization",
    body: "Group everything into folders from the sidebar — one per project, source, or playlist. Each folder tracks its own videos, failures, and download states independently.",
  },
  {
    icon: "✨",
    title: "AI URL extraction",
    body: "Paste a messy wall of text — chat exports, notes, half-broken links. GPT-4o pulls out every URL, drops duplicates, and interleaves platforms so the queue never bottlenecks on one site.",
  },
  {
    icon: "⚡",
    title: "Parallel metadata fetch",
    body: "Bulk uploads resolve five URLs at a time and stream results back live, so you watch titles, durations, thumbnails, and file sizes land one by one instead of staring at a spinner.",
  },
  {
    icon: "📥",
    title: "Best-quality downloads",
    body: "Highest available video and audio, remuxed into MP4 — never re-encoded, so nothing is lost to a second compression pass. Pick an output folder once and files save straight there.",
  },
  {
    icon: "🔄",
    title: "State that survives reloads",
    body: "Every video's status — fresh, pending, downloaded, cancelled, or failed — is persisted server-side. Refresh the tab or navigate away and the list looks exactly as you left it.",
  },
  {
    icon: "🧾",
    title: "Nothing fails silently",
    body: "URLs that can't be resolved are collected per folder with the reason available, so you can review and retry them in a batch instead of hunting for what went missing.",
  },
];

const PLATFORMS = ["YouTube", "Instagram", "Reddit", "X / Twitter", "Facebook", "TikTok"];

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
  New: "bg-blue-500/15 text-blue-300 border-blue-400/25",
  Fixed: "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
  Improved: "bg-amber-500/15 text-amber-300 border-amber-400/25",
};

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto py-12 sm:py-16 px-6 sm:px-8">
      {/* ---------- Hero ---------- */}
      <section className="text-center space-y-6 mb-16">
        <div className="inline-flex items-center gap-2.5 bg-blue-50 text-blue-700 pl-2 pr-4 py-1.5 rounded-full text-xs font-semibold shadow-sm border border-blue-100">
          <span className="flex items-center gap-1.5 bg-blue-600 text-white px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            New update
          </span>
          <span className="font-mono tracking-tight">{APP_VERSION}</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-900 leading-[1.08]">
          Catalog and download
          <br className="hidden sm:block" /> video from{" "}
          <span className="text-blue-600">anywhere on the web.</span>
        </h1>

        <p className="text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto font-medium leading-relaxed">
          Paste messy text full of scattered links. zscrape extracts the URLs, pulls rich
          metadata for each one, and downloads the highest-quality file straight to your machine.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {PLATFORMS.map((p) => (
            <span
              key={p}
              className="text-xs font-medium text-zinc-600 bg-white border border-zinc-200 px-3 py-1.5 rounded-full shadow-sm"
            >
              {p}
            </span>
          ))}
          <span className="text-xs font-medium text-zinc-400 px-1.5 py-1.5">and more</span>
        </div>
      </section>

      {/* ---------- What's new ---------- */}
      <section className="mb-16 sm:mb-20">
        <div className="bg-zinc-900 rounded-3xl p-7 sm:p-10 shadow-xl shadow-zinc-900/10 overflow-hidden relative">
          {/* soft accent glow */}
          <div
            aria-hidden
            className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl"
          />

          <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                What&apos;s new in this update
              </h2>
              <p className="text-sm text-zinc-400 mt-1.5">
                Downloads got significantly more reliable, and admins got a workspace of their own.
              </p>
            </div>
            <span className="shrink-0 text-xs font-mono text-zinc-300 bg-white/10 border border-white/15 px-3 py-1.5 rounded-full self-start sm:self-auto">
              {APP_VERSION}
            </span>
          </div>

          <ul className="relative space-y-5">
            {CHANGELOG.map((item) => (
              <li
                key={item.title}
                className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 pb-5 last:pb-0 border-b border-white/10 last:border-0"
              >
                <span
                  className={`shrink-0 w-fit sm:w-20 text-center text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border ${
                    TAG_STYLES[item.tag] ?? "bg-white/10 text-zinc-300 border-white/15"
                  }`}
                >
                  {item.tag}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-white mb-0.5">{item.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="mb-16 sm:mb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            Everything it does
          </h2>
          <p className="text-zinc-600 mt-2 max-w-xl mx-auto">
            Built for working through hundreds of links at a time without babysitting them.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white border border-zinc-200/80 p-7 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-blue-200 transition-all duration-300"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 flex items-center justify-center mb-5 text-xl shadow-sm border border-blue-200/50">
                {f.icon}
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2 tracking-tight">{f.title}</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mb-16 sm:mb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
            Three steps to your first download
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative bg-zinc-50/80 border border-zinc-200/80 rounded-2xl p-6 pt-7"
            >
              <span className="absolute -top-3.5 left-6 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-md shadow-blue-600/25">
                {s.n}
              </span>
              <h3 className="text-base font-bold text-zinc-900 mb-1.5 mt-1 tracking-tight">
                {s.title}
              </h3>
              <p className="text-sm text-zinc-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="text-center">
        <div className="inline-flex flex-col items-center gap-5 bg-gradient-to-br from-zinc-900 to-zinc-800 px-8 sm:px-14 py-10 rounded-3xl shadow-xl shadow-zinc-900/15 w-full sm:w-auto">
          <h2 className="text-2xl font-bold text-white tracking-tight">Ready to get started?</h2>
          <div className="flex items-center gap-3 text-zinc-300">
            <span className="text-xl animate-bounce">👈</span>
            <span className="font-medium text-base sm:text-lg">
              Create your first folder in the sidebar.
            </span>
          </div>
          <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
            On mobile, open the menu with the button at the top-left.
          </p>
        </div>
      </section>
    </div>
  );
}
