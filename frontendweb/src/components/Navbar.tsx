export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-white border-b border-zinc-200 text-zinc-900 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          Z
        </div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">
          zscrape
        </h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded-full font-mono">
          v1.0.0
        </span>
      </div>
    </nav>
  );
}
