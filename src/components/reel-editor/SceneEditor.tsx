"use client";

import { useState } from "react";
import { ReelData } from "../../data/demoReelData";
import { AssetPicker } from "../assets/AssetPicker";
import { ImageIcon, VideoIcon, Edit2, RefreshCw, Loader2 } from "lucide-react";

type Props = {
  data: ReelData;
  onChange: (newData: ReelData) => void;
};

export function SceneEditor({ data, onChange }: Props) {
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

  const handleRegenerate = async (index: number) => {
    const scene = data.scenes[index];
    if (!scene.visualPrompt) {
      alert("Please enter a visual prompt first.");
      return;
    }

    setRegeneratingIndex(index);
    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.visualPrompt,
          artStyle: (data as any).artStyle || "cinematic_3d",
          seed: (data as any).seed,
          usePremium: data.usePremiumImageStack ? true : false
        }),
      });

      if (!response.ok) throw new Error("Regeneration failed");

      const { imageUrl } = await response.json();

      const newScenes = [...data.scenes];
      newScenes[index] = {
        ...newScenes[index],
        backgroundUrl: imageUrl,
        backgroundType: "image"
      };

      onChange({ ...data, scenes: newScenes });
    } catch (error) {
      console.error("Failed to regenerate image", error);
      alert("Failed to regenerate image. Please try again.");
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const updateScene = (index: number, field: string, value: any) => {
    const newScenes = [...data.scenes];
    newScenes[index] = { ...newScenes[index], [field]: value };
    onChange({ ...data, scenes: newScenes });
  };

  const handleAssetSelect = (url: string) => {
    if (activePickerIndex === null) return;
    
    // Determine type from URL (simple check)
    const isVideo = url.match(/\.(mp4|mov|webm)$/i);
    
    const newScenes = [...data.scenes];
    newScenes[activePickerIndex] = { 
      ...newScenes[activePickerIndex], 
      backgroundUrl: url,
      backgroundType: isVideo ? "video" : "image"
    };
    
    onChange({ ...data, scenes: newScenes });
    setActivePickerIndex(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-6 transition-colors">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Global Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Business Name</label>
            <input 
              value={data.businessName}
              onChange={(e) => onChange({ ...data, businessName: e.target.value })}
              className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none focus:border-indigo-500 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Brand Color</label>
            <div className="flex gap-2">
              <input 
                type="color"
                value={data.brandColor}
                onChange={(e) => onChange({ ...data, brandColor: e.target.value })}
                className="w-8 h-8 rounded border border-slate-300 dark:border-gray-700 cursor-pointer"
              />
              <input 
                value={data.brandColor}
                onChange={(e) => onChange({ ...data, brandColor: e.target.value })}
                className="flex-1 text-sm px-3 py-1 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">AI Generation Stack</label>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => onChange({ ...data, usePremiumImageStack: !data.usePremiumImageStack })}
                className={`w-12 h-6 rounded-full transition-all relative ${data.usePremiumImageStack ? 'bg-indigo-600' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all shadow-md ${data.usePremiumImageStack ? 'left-6.5' : 'left-0.5'}`} />
              </button>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {data.usePremiumImageStack ? "Paid Stack (Claude + Fal + Eleven)" : "Free Stack (Gemini + Together)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {data.scenes.map((scene, index) => (
          <div key={scene.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-slate-200 dark:border-gray-800 p-5 transition-all hover:shadow-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2">
                <span className="w-6 h-6 bg-slate-100 dark:bg-gray-800 text-slate-500 rounded-full flex items-center justify-center text-[10px]">{index + 1}</span>
                {scene.type} Scene
              </h3>
              <span className="text-xs bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 px-2 py-1 rounded font-mono">
                {scene.durationInSeconds}s
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Headline</label>
                  <textarea 
                    rows={2}
                    value={scene.headline}
                    onChange={(e) => updateScene(index, "headline", e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none focus:border-indigo-500 dark:text-white resize-none transition-colors"
                  />
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Caption / Voiceover</label>
                  <textarea 
                    rows={2}
                    value={scene.caption || ""}
                    onChange={(e) => updateScene(index, "caption", e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none focus:border-indigo-500 dark:text-white resize-none transition-colors"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visual Prompt</label>
                    <button
                      type="button"
                      disabled={regeneratingIndex !== null}
                      onClick={() => handleRegenerate(index)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {regeneratingIndex === index ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      REGENERATE IMAGE
                    </button>
                  </div>
                  <textarea 
                    rows={3}
                    value={scene.visualPrompt || ""}
                    onChange={(e) => updateScene(index, "visualPrompt", e.target.value)}
                    className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none focus:border-indigo-500 dark:text-white resize-none transition-colors"
                    placeholder="Describe the image you want for this scene..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {scene.sticker !== undefined && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Sticker</label>
                      <input 
                        value={scene.sticker || ""}
                        onChange={(e) => updateScene(index, "sticker", e.target.value)}
                        className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none focus:border-indigo-500 dark:text-white transition-colors"
                      />
                    </div>
                  )}
                  
                  {scene.subText !== undefined && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">SubText</label>
                      <input 
                        value={scene.subText || ""}
                        onChange={(e) => updateScene(index, "subText", e.target.value)}
                        className="w-full text-sm px-3 py-2 bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-700 rounded-md outline-none focus:border-indigo-500 dark:text-white transition-colors"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-widest">Background</label>
                <div 
                  className="relative group aspect-[9/16] rounded-lg overflow-hidden bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 cursor-pointer"
                  onClick={() => setActivePickerIndex(index)}
                >
                  {scene.backgroundUrl ? (
                    scene.backgroundType === "video" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <VideoIcon className="w-8 h-8 mb-2" />
                        <span className="text-[10px] font-medium">Video Background</span>
                      </div>
                    ) : (
                      <img 
                        src={scene.backgroundUrl} 
                        alt="Background" 
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="w-8 h-8 mb-2" />
                      <span className="text-[10px] font-medium">No Background</span>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-white/90 dark:bg-gray-900/90 p-2 rounded-full shadow-lg">
                      <Edit2 className="w-4 h-4 text-slate-700 dark:text-white" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePickerIndex(index)}
                  className="w-full py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  Change Media
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {activePickerIndex !== null && (
        <AssetPicker
          onSelect={handleAssetSelect}
          onClose={() => setActivePickerIndex(null)}
          currentUrl={data.scenes[activePickerIndex].backgroundUrl}
        />
      )}
    </div>
  );
}
