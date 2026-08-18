"use client";

import { useState, ReactNode } from "react";
import AlertMessagePopUp from "@/components/AlertMessagePopUp";
import { apiFetch } from "@/lib/api";

interface ChatgptUrlCheckerPopUpCardProps {
  folderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ChatgptUrlCheckerPopUpCard({ folderId, onClose, onSuccess }: ChatgptUrlCheckerPopUpCardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [inputText, setInputText] = useState("");
  const [extractedUrls, setExtractedUrls] = useState<string[]>([]);
  const [remainingUrls, setRemainingUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("");
  const [alert, setAlert] = useState<{ title: string; message: string | ReactNode; type?: "success" | "error" | "warning" | "info" } | null>(null);

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    
    const lines = inputText.split("\n");
    if (lines.length > 100) {
      setError(`Please paste a maximum of 100 lines. You pasted ${lines.length}/100 lines.`);
      return;
    }

    if (inputText.length > 20000) {
      setError(`Text is too long (${inputText.length}/20000 characters). Please paste a smaller batch.`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setStatusText("Extracting clean URLs with AI...");
      
      const chatRes = await apiFetch("/chatgpturlchecker/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: inputText }),
      });
      
      if (!chatRes.ok) throw new Error("Failed to process URLs with ChatGPT");
      
      const chatData = await chatRes.json();
      let urls: string[] = chatData.urls || [];
      
      if (urls.length === 0) {
        throw new Error("No valid URLs found in the text.");
      }

      if (urls.length > 50) {
        setRemainingUrls(urls.slice(50));
        urls = urls.slice(0, 50);
        setError(`Extracted ${urls.length + remainingUrls.length} URLs, but you can only process 50 at a time. The first 50 are loaded below. Copy the remaining ones to use next!`);
      } else {
        setRemainingUrls([]);
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
      setStatusText(`Starting upload...`);
      
      const bulkRes = await apiFetch("/video/bulk-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId, urls: extractedUrls }),
      });

      if (!bulkRes.ok) throw new Error("Failed to upload URLs to database");
      
      const reader = bulkRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let saved = 0;
      let duplicates = 0;
      let failed = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "start") {
              setStatusText(`Preparing to add ${data.total} videos...`);
            } else if (data.type === "progress") {
              setStatusText(`Adding videos... (${data.processed}/${data.total})`);
            } else if (data.type === "complete") {
              saved = data.saved;
              duplicates = data.duplicates;
              failed = data.failed;
            }
          } catch (e) {
            console.error("Failed to parse stream chunk", line);
          }
        }
        if (done) break;
      }

      const successMessage = (
        <div className="flex flex-col gap-1 mt-1">
          {saved > 0 && (
            <div className="text-green-600 font-medium">
              <span className="mr-1">✅</span> Successfully added {saved} video(s).
            </div>
          )}
          {duplicates > 0 && (
            <div className="text-blue-600">
              <span className="mr-1">ℹ️</span> Skipped {duplicates} duplicate URL(s).
            </div>
          )}
          {failed > 0 && (
            <div className="text-red-600">
              <span className="mr-1">❌</span> {failed} URL(s) failed and moved to Failed URLs.
            </div>
          )}
        </div>
      );

      setAlert({
        title: "Upload Complete",
        message: successMessage,
        type: failed > 0 ? "warning" : "success",
      });

      onSuccess();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
      setStatusText("");
    }
  };

  const handleAlertClose = () => {
    setAlert(null);
    if (step === 2) {
      onClose(); // Close the whole popup after viewing success
    }
  };

  return (
    <>
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
                {remainingUrls.length > 0 && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-amber-800 font-medium truncate pr-2">
                      {remainingUrls.length} URLs remain unadded.
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(remainingUrls.join('\n'))}
                      className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded transition-colors shadow-sm"
                    >
                      Copy Remaining URLs
                    </button>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/50">
            <div className="text-sm text-blue-600 font-medium truncate pr-4">
              {/* Status text hidden during step 2 to prefer the button text */}
              {step === 1 && statusText}
            </div>
            <div className="flex gap-3 shrink-0">
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
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-green-600/20 flex items-center gap-2 min-w-[140px] justify-center"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"/>
                      {statusText || "Saving..."}
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

      {alert && (
        <AlertMessagePopUp
          title={alert.title}
          message={alert.message}
          type={alert.type}
          onClose={handleAlertClose}
        />
      )}
    </>
  );
}
