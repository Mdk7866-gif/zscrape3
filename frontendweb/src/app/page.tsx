export default function Home() {
  return (
    <div className="max-w-5xl mx-auto py-12 sm:py-20 px-6 sm:px-8">
      {/* Hero Section */}
      <div className="text-center space-y-6 mb-16 sm:mb-24">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-full text-sm font-semibold tracking-wide uppercase shadow-sm border border-blue-100/50 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
          Now v3.0 is live
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-900 leading-[1.1]">
          The professional way to manage<br className="hidden sm:block" /> and <span className="text-blue-600">scrape video URLs.</span>
        </h1>
        <p className="text-lg sm:text-xl text-zinc-600 max-w-2xl mx-auto font-medium leading-relaxed">
          zscrape is an advanced, automated cataloging system designed to extract high-quality metadata and seamlessly download videos from across the web.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="bg-white border border-zinc-200/80 p-8 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 flex items-center justify-center font-bold mb-6 text-2xl shadow-sm border border-blue-200/50">
            📁
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-3 tracking-tight">Structured Organization</h3>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Create limitless custom folders in the sidebar to organize your video feeds logically. Keep your projects, sources, and downloads perfectly categorized.
          </p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-8 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 flex items-center justify-center font-bold mb-6 text-2xl shadow-sm border border-blue-200/50">
            ⚡
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-3 tracking-tight">AI Metadata Extraction</h3>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Paste messy text blocks containing scattered links. Our AI parses them, and our backend extracts rich metadata (thumbnails, duration, platform) instantly.
          </p>
        </div>

        <div className="bg-white border border-zinc-200/80 p-8 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 sm:col-span-2 lg:col-span-1">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 flex items-center justify-center font-bold mb-6 text-2xl shadow-sm border border-blue-200/50">
            📥
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-3 tracking-tight">Native Downloading</h3>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Download the highest quality MP4 stream straight to your local machine with robust backend queueing and accurate, live progress tracking.
          </p>
        </div>
      </div>

      <div className="mt-20 text-center flex flex-col items-center">
        <h2 className="text-2xl font-bold text-zinc-900 mb-6">Ready to get started?</h2>
        <div className="inline-flex flex-col sm:flex-row items-center gap-4 bg-zinc-900 px-8 py-5 rounded-2xl shadow-xl">
          <span className="text-lg">👈</span> 
          <span className="text-white font-medium text-lg">Create your first folder in the sidebar.</span>
        </div>
      </div>
    </div>
  );
}
