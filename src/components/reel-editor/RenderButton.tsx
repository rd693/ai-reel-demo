"use client";

import { useState } from "react";
import { reelStore } from "../../lib/reel/reelStore";
import { ReelRecord } from "../../lib/reel/reelTypes";

type Props = {
  reelId: string;
  onRenderComplete?: (updatedRecord: ReelRecord) => void;
};

export function RenderButton({ reelId, onRenderComplete }: Props) {
  const [isRendering, setIsRendering] = useState(false);

  const handleRender = async () => {
    setIsRendering(true);
    try {
      const response = await reelStore.renderReel(reelId);
      if (response.success && onRenderComplete) {
        onRenderComplete(response.reel);
      }
    } catch (e) {
      console.error("Render failed", e);
      alert(`Render failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <button
      onClick={handleRender}
      disabled={isRendering}
      className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-white transition-all shadow-lg ${
        isRendering
          ? "bg-slate-600 cursor-not-allowed"
          : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 hover:shadow-blue-500/25 hover:-translate-y-0.5"
      }`}
    >
      {isRendering ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Rendering...
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Render MP4
        </>
      )}
    </button>
  );
}
