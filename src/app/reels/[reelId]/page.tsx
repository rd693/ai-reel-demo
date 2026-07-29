"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { reelStore } from "../../../lib/reel/reelStore";
import { ReelRecord } from "../../../lib/reel/reelTypes";
import { ReelData } from "../../../data/demoReelData";
import { SceneEditor } from "../../../components/reel-editor/SceneEditor";
import { ReelPreview } from "../../../components/reel-editor/ReelPreview";
import { RenderButton } from "../../../components/reel-editor/RenderButton";
import { RenderedVideosList } from "../../../components/reel-editor/RenderedVideosList";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

const PRESET_LABELS: Record<string, string> = {
  offer: "Offer Reel",
  before_after: "Before / After",
  new_service: "Service Launch",
  festival: "Holiday Promo",
  testimonial: "Testimonial",
  restaurant_menu: "Menu Highlight",
  flash_sale: "Flash Sale",
  local_awareness: "Local Buzz",
};

export default function ReelEditorPage() {
  const params = useParams();
  const router = useRouter();
  const reelId = params?.reelId as string;
  const [record, setRecord] = useState<ReelRecord | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (reelId) {
      reelStore.getReel(reelId).then((found) => {
        if (found) {
          setRecord(found);
        } else {
          router.replace("/dashboard");
        }
      });
    }
  }, [reelId, router]);

  const handleDataChange = async (newData: ReelData) => {
    if (!record) return;
    
    // 1. Update local state immediately for snappy UI
    setRecord(prev => prev ? { ...prev, data: newData } : null);
    setSaveStatus("saving");

    // 2. Debounce the API call
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const updated = await reelStore.updateReel(record.metadata.id, {
          data: newData,
        });
        setRecord(updated);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        console.error("Failed to update reel", e);
        setSaveStatus("error");
      }
    }, 1000);
  };

  const handleRenderComplete = (updatedRecord: ReelRecord) => {
    setRecord(updatedRecord);
  };

  if (!record) return <div className="p-8 text-center text-slate-500">Loading reel...</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="sticky top-0 z-[100] bg-white/95 backdrop-blur-md -mx-4 px-4 py-6 mb-8 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <span>Editor</span>
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ml-2">
              {PRESET_LABELS[record.input.preset] || "Custom"}
            </span>
            
            {/* Save Indicator */}
            <div className="flex items-center gap-1.5 ml-4 text-[11px] font-medium transition-all duration-300">
              {saveStatus === "saving" && (
                <div className="flex items-center text-indigo-600 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Saving...
                </div>
              )}
              {saveStatus === "saved" && (
                <div className="flex items-center text-emerald-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Saved
                </div>
              )}
              {saveStatus === "error" && (
                <div className="flex items-center text-rose-600">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Save Failed
                </div>
              )}
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-none">{record.metadata.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-full hidden md:inline">
            ID: {reelId.slice(0, 8)}
          </span>
          <RenderButton reelId={reelId} onRenderComplete={handleRenderComplete} />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Left Column: Editor */}
        <div className="w-full lg:w-3/5 order-2 lg:order-1">
          <SceneEditor data={record.data} onChange={handleDataChange} />
        </div>

        {/* Right Column: Preview + Rendered Videos (sticky) */}
        <div className="w-full lg:w-2/5 order-1 lg:order-2 lg:sticky lg:top-32 space-y-6">
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <ReelPreview data={record.data} />
            </div>
          </div>

          {/* Rendered Videos History */}
          <RenderedVideosList videos={record.renderedVideos} />
        </div>
      </div>
    </div>
  );
}
