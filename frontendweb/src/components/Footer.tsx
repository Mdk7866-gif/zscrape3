export default function Footer() {
  return (
    <footer className="py-4 px-6 bg-white border-t border-zinc-200 text-center text-xs text-zinc-400 font-mono">
      <p>&copy; {new Date().getFullYear()} zscrape. All rights reserved.</p>
    </footer>
  );
}
