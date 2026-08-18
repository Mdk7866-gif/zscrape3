"use client";

import { useTheme, type Theme } from "@/components/ThemeProvider";

const SunIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SystemIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "system", label: "System", Icon: SystemIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

/**
 * Segmented light / system / dark control.
 *
 * Fixed dimensions in every state (the selection is a translated pill, not a
 * change in box size), so switching themes never nudges the navbar layout.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const index = Math.max(0, OPTIONS.findIndex((o) => o.value === theme));

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="relative flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5"
    >
      {/* Sliding selection pill */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-7 rounded-full bg-surface shadow-sm ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(0.34,1.3,0.64,1)]"
        style={{ transform: `translateX(${index * 1.75}rem)` }}
      />
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={`relative z-10 grid h-7 w-7 place-items-center rounded-full transition-colors ${
              active ? "text-accent" : "text-subtle hover:text-fg"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
