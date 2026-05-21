import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import { DownloadQueueProvider } from "@/components/DownloadQueueContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "zscrape – Video URL Manager",
  description: "A clean, efficient way to manage, scrape, and download video URLs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col h-screen bg-slate-50 text-zinc-900">
        <DownloadQueueProvider>
          <Navbar />
          <div className="flex flex-1 overflow-hidden">
            {/* Desktop sidebar — hidden on mobile (mobile uses drawer in Navbar) */}
            <div className="hidden lg:flex lg:w-64 lg:shrink-0 h-full overflow-hidden border-r border-zinc-200">
              <Sidebar />
            </div>
            <main className="flex-1 overflow-y-auto bg-white">
              {children}
            </main>
          </div>
          <Footer />
        </DownloadQueueProvider>
      </body>
    </html>
  );
}
