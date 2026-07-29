"use client";

import { useState } from "react";
import { Download, ExternalLink, Copy, Check, Video } from "lucide-react";
import { RenderedVideo } from "../../lib/reel/reelTypes";

type Props = {
  videos: RenderedVideo[];
};

export function RenderedVideosList({ videos }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (url: string, id: string) => {
    const fullUrl = window.location.origin + url;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (videos.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
        <Video className="mx-auto text-slate-300 mb-2" size={32} />
        <p className="text-slate-500 text-sm">No renders yet. Click "Render MP4" to start.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
          <Video size={16} />
          Render History
        </h3>
      </div>
      <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
        {videos.slice().reverse().map((video) => (
          <div key={video.id} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs font-mono text-slate-400 mb-1">
                  {new Date(video.createdAt).toLocaleString()}
                </p>
                <p className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">
                  {video.fileName}
                </p>
              </div>
              <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                {video.status}
              </span>
            </div>
            
            <div className="flex gap-2 mt-3">
              <a
                href={video.videoUrl}
                download={video.fileName}
                className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <Download size={14} />
                Download
              </a>
              <a
                href={video.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center p-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all"
                title="Open in new tab"
              >
                <ExternalLink size={14} />
              </a>
              <button
                onClick={() => copyToClipboard(video.videoUrl, video.id)}
                className="flex items-center justify-center p-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all"
                title="Copy video link"
              >
                {copiedId === video.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
