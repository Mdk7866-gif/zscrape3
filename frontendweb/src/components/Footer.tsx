import { APP_VERSION } from "@/lib/version";

export default function Footer() {
  return (
    <footer className="shrink-0 border-t border-line bg-surface/70 px-4 py-3 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-1 text-center text-[11px] text-subtle sm:flex-row sm:text-left">
        <p className="font-mono">
          &copy; {new Date().getFullYear()} zscrape. All rights reserved.
        </p>
        <p className="flex items-center gap-2 font-mono">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
          <span>v{APP_VERSION}</span>
        </p>
      </div>
    </footer>
  );
}
