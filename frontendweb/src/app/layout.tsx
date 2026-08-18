import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { DownloadQueueProvider } from "@/components/DownloadQueueContext";
import { AdminProvider } from "@/components/AdminContext";
import { ThemeProvider, THEME_SCRIPT } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "zscrape – Video URL Manager",
  description:
    "A clean, efficient way to manage, scrape, and download video URLs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches --bg in globals.css so the mobile browser chrome blends with the
  // page in both themes instead of flashing white behind a dark UI.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafb" },
    { media: "(prefers-color-scheme: dark)", color: "#111219" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // ThemeProvider's pre-paint script adds `.dark` before React sees the
      // document, so the server and client class lists legitimately differ.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Must run before first paint — see THEME_SCRIPT for why. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* h-dvh, not h-screen: on mobile browsers `vh` ignores the collapsing
          address bar, which left the footer stranded under the viewport. */}
      <body className="flex h-dvh min-h-dvh flex-col bg-bg text-fg">
        <ThemeProvider>
          {/* AdminProvider wraps the queue: components inside read admin state to
              decide which workspace's folders/videos to load. */}
          <AdminProvider>
            <DownloadQueueProvider>
              {/* Ambient backdrop. Fixed + behind everything + pointer-events-none,
                  so it costs no layout and never intercepts clicks. */}
              <div
                aria-hidden
                className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
              >
                <div className="absolute inset-0 bg-grid opacity-60" />
                <div className="absolute -top-40 -left-32 h-[36rem] w-[36rem] rounded-full bg-[var(--glow-1)] blur-[120px] animate-drift" />
                <div className="absolute -bottom-48 -right-24 h-[32rem] w-[32rem] rounded-full bg-[var(--glow-2)] blur-[120px] animate-drift [animation-delay:-6s]" />
                <div className="absolute top-1/3 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[var(--glow-3)] blur-[130px] animate-drift [animation-delay:-12s]" />
              </div>

              <Navbar />

              <div className="flex min-h-0 flex-1">
                {/* Desktop sidebar — below lg the same component renders inside
                    the Navbar's drawer. */}
                <div className="hidden shrink-0 lg:flex lg:w-72 xl:w-76">
                  <Sidebar />
                </div>
                <main className="min-w-0 flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>

              <Footer />
            </DownloadQueueProvider>
          </AdminProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
