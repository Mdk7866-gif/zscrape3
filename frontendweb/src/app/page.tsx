export default function Home() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-zinc-900">
          Welcome to <span className="text-blue-600">zscrape</span>
        </h1>
        <p className="text-lg text-zinc-600 max-w-xl mx-auto">
          A clean, efficient way to manage, scrape, and catalog video URLs and folders seamlessly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-zinc-200 p-6 rounded-lg shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all duration-200">
          <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-4 text-xl">
            📁
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Folder Organization</h3>
          <p className="text-sm text-zinc-600">
            Create custom folders in the sidebar to organize your video feeds and scrapers.
          </p>
        </div>

        <div className="bg-white border border-zinc-200 p-6 rounded-lg shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all duration-200">
          <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-4 text-xl">
            🎥
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Scrape Videos</h3>
          <p className="text-sm text-zinc-600">
            Extract rich video information including duration, thumbnail, platform, and upload date.
          </p>
        </div>

        <div className="bg-white border border-zinc-200 p-6 rounded-lg shadow-sm hover:shadow-md hover:border-blue-500/50 transition-all duration-200">
          <div className="w-10 h-10 rounded bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-4 text-xl">
            ⚠️
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Failed URLs</h3>
          <p className="text-sm text-zinc-600">
            Track links that failed to save and download or retry them later.
          </p>
        </div>
      </div>

      <div className="mt-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 px-4 py-2 rounded-full text-blue-600 text-sm">
          <span>💡</span> Get started by creating a folder in the sidebar.
        </div>
      </div>
    </div>
  );
}

