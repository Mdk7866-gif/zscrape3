"use client";

import { useState } from "react";

interface ChatgptUrlCheckerPopUpCardProps {
  folderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ChatgptUrlCheckerPopUpCard({ folderId, onClose, onSuccess }: ChatgptUrlCheckerPopUpCardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [inputText, setInputText] = useState("");
  const [extractedUrls, setExtractedUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    
    const lines = inputText.split("\n");
    if (lines.length > 150) {
      setError("Please paste a maximum of 100-150 lines to avoid overwhelming the AI.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setStatusText("Extracting clean URLs with AI...");
      
      const chatRes = await fetch(`${API_BASE}/chatgpturlchecker/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: inputText }),
      });
      
      if (!chatRes.ok) throw new Error("Failed to process URLs with ChatGPT");
      
      const chatData = await chatRes.json();
      const urls: string[] = chatData.urls || [];
      
      if (urls.length === 0) {
        throw new Error("No valid URLs found in the text.");
      }

      setExtractedUrls(urls);
      setStep(2);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleBulkUpload = async () => {
    if (extractedUrls.length === 0) return;

    try {
      setLoading(true);
      setError(null);
      setStatusText(`Extracting metadata and saving ${extractedUrls.length} videos...`);
      
      const bulkRes = await fetch(`${API_BASE}/video/bulk-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId, urls: extractedUrls }),
      });

      if (!bulkRes.ok) throw new Error("Failed to upload URLs to database");
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <h2 className="text-lg font-semibold text-zinc-800 flex items-center gap-2">
            ✨ AI URL Extractor
          </h2>
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        
        <div className="p-6 flex-1">
          {step === 1 ? (
            <>
              <p className="text-sm text-zinc-500 mb-4">
                Paste messy text containing URLs from YouTube, Twitter, Instagram, etc. Our AI will extract all valid links automatically. (Max 100 lines)
              </p>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={loading}
                placeholder="Paste your text here..."
                className="w-full h-64 p-4 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none"
              />
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-800 mb-2">
                Successfully extracted {extractedUrls.length} valid URL(s):
              </p>
              <div className="w-full h-64 p-4 text-sm bg-zinc-50 border border-zinc-200 rounded-xl overflow-y-auto">
                <ul className="list-disc pl-5 space-y-1 text-zinc-600 break-all">
                  {extractedUrls.map((url, idx) => (
                    <li key={idx}>{url}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="text-sm text-blue-600 font-medium">
            {statusText}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => step === 2 && !loading ? setStep(1) : onClose()}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {step === 2 ? "Back" : "Cancel"}
            </button>
            
            {step === 1 ? (
              <button
                onClick={handleExtract}
                disabled={loading || !inputText.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-blue-600/20 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    Extracting...
                  </>
                ) : (
                  "Extract URLs"
                )}
              </button>
            ) : (
              <button
                onClick={handleBulkUpload}
                disabled={loading}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-green-600/20 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                    Saving...
                  </>
                ) : (
                  `Add ${extractedUrls.length} URLs`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
