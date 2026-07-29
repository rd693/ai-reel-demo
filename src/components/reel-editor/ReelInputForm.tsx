"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ReelInput } from "../../lib/reel/reelTypes";
import { reelStore } from "../../lib/reel/reelStore";
import { Wand2 } from "lucide-react";

import { generateFacelessReelContent } from "../../agents/seriesAgent";

export function ReelInputForm() {
  const router = useRouter();
  const PRESETS = [
    { id: "offer", label: "Offer Reel", description: "A standard promotional offer to drive sales." },
    { id: "before_after", label: "Before / After Reel", description: "Showcase the transformation your service provides." },
    { id: "new_service", label: "New Service Launch", description: "Announce and build hype for a new offering." },
    { id: "festival", label: "Festival / Holiday Promo", description: "Seasonal promotions and holiday-themed content." },
    { id: "testimonial", label: "Testimonial Reel", description: "Build trust with real client stories and feedback." },
    { id: "restaurant_menu", label: "Restaurant Menu Highlight", description: "Showcase signature dishes and menu items." },
    { id: "flash_sale", label: "Flash Sale Reel", description: "Drive urgent sales with limited-time deals." },
    { id: "local_awareness", label: "Local Awareness Reel", description: "Introduce your business to the local community." },
  ] as const;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ReelInput>({
    businessName: "",
    handle: "",
    industry: "",
    offer: "",
    cta: "DM us to book",
    tone: "viral",
    brandColor: "#ff2f92",
    accentColor: "#fff000",
    preset: "offer",
    language: "english",
    durationInSeconds: 60,
    format: "reel",
    musicUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    logoUrl: "",
    usePremiumImageStack: false,
  });

  const MUSIC_PRESETS = [
    { label: "Viral Upbeat", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
    { label: "Lofi Chill", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
    { label: "Cinematic Epic", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.name === 'durationInSeconds' ? parseInt(e.target.value) : e.target.value });
  };

  const selectedPreset = PRESETS.find(p => p.id === formData.preset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Build context from form fields
      const seriesContext = [
        `Business: ${formData.businessName}`,
        `Industry: ${formData.industry}`,
        `Offer: ${formData.offer}`,
        `CTA: ${formData.cta}`,
        `Tone: ${formData.tone}`,
        `Preset: ${selectedPreset?.label} — ${selectedPreset?.description}`
      ].join('. ');
      // 1. Generate structural data using the AI AGENT
      console.log("[ReelInputForm] Triggering AI Agent for generation...");
      const aiData = await generateFacelessReelContent(
        formData.industry as any,
        formData.tone === 'viral' ? 'cinematic_3d' : 'premium_minimal',
        formData.durationInSeconds,
        formData.language,
        "Antoni",               // voiceId
        undefined,              // no customScript
        formData.businessName,  // ✅ subject = business name
        seriesContext,          // ✅ context built from form
        undefined,              // no visualStylePrompt
        undefined,              // no visualStyleOverride
        formData.usePremiumImageStack // ✅ Pass it!
      );

      // Merge AI data with input metadata
      const reelData = {
        ...aiData,
        businessName: formData.businessName,
        brandColor: formData.brandColor,
        accentColor: formData.accentColor,
      } as any;

      // 2. Wrap in DB record
      const id = crypto.randomUUID();
      const record = {
        metadata: {
          id,
          title: formData.businessName,
          createdAt: Date.now(),
          status: "Draft" as const,
        },
        input: formData,
        data: reelData,
        renderedVideos: [],
      };

      // 3. Save and redirect
      await reelStore.saveReel(record);
      router.push(`/reels/${id}`);
    } catch (error) {
      console.error("[ReelInputForm] Generation failed:", error);
      setLoading(false);
      alert("Generation failed. Please check your API keys.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 space-y-2">
          <label className="text-sm font-semibold text-slate-700">Reel Template (Preset)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFormData({ ...formData, preset: p.id })}
                className={`p-4 rounded-xl border text-left transition-all ${formData.preset === p.id
                    ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
              >
                <div className={`text-sm font-bold ${formData.preset === p.id ? "text-indigo-700" : "text-slate-800"}`}>
                  {p.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Target Language</label>
          <select
            name="language"
            value={formData.language}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            <option value="english">English (Global)</option>
            <option value="hindi">Hindi (Local Viral)</option>
            <option value="spanish">Spanish</option>
            <option value="japanese">Japanese</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Duration (Seconds)</label>
          <select
            name="durationInSeconds"
            value={formData.durationInSeconds}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            <option value="15">15 Seconds (Quick Hook)</option>
            <option value="30">30 Seconds (Standard)</option>
            <option value="60">60 Seconds (Full Story)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Business Name</label>
          <input
            required
            name="businessName"
            value={formData.businessName}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. Glow Skin Studio"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Social Handle</label>
          <input
            required
            name="handle"
            value={formData.handle}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. @glowskinstudio"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Industry / Niche</label>
          <input
            required
            name="industry"
            value={formData.industry}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. Med Spa, Dentist, Plumber"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Tone</label>
          <select
            name="tone"
            value={formData.tone}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
          >
            <option value="viral">Viral / Gen Z</option>
            <option value="premium">Premium / Luxury</option>
            <option value="friendly">Friendly / Local</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-slate-700">Core Offer</label>
          <input
            required
            name="offer"
            value={formData.offer}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. 20% off your first Hydrafacial this month"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-slate-700">Call to Action (CTA)</label>
          <input
            required
            name="cta"
            value={formData.cta}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="e.g. DM 'GLOW' to book your slot"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Video Format</label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, format: "reel" })}
              className={`flex-1 py-2 rounded-lg border transition-all ${formData.format === 'reel' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
            >
              9:16 Reel
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, format: "video" })}
              className={`flex-1 py-2 rounded-lg border transition-all ${formData.format === 'video' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}
            >
              16:9 Video
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Background Music</label>
          <select
            name="musicUrl"
            value={formData.musicUrl}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            {MUSIC_PRESETS.map(m => (
              <option key={m.url} value={m.url}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-slate-700">Branding Logo URL (Optional)</label>
          <input
            name="logoUrl"
            value={formData.logoUrl}
            onChange={handleChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            placeholder="https://example.com/logo.png"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-slate-700">AI Generation Stack</label>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, usePremiumImageStack: false })}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${
                !formData.usePremiumImageStack
                  ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className={`text-sm font-bold ${!formData.usePremiumImageStack ? "text-indigo-700" : "text-slate-800"}`}>Free Stack</div>
              <div className="text-xs text-slate-500 mt-1">Uses Gemini/Groq, Google TTS, and free community image models.</div>
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, usePremiumImageStack: true })}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${
                formData.usePremiumImageStack
                  ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="text-sm font-bold text-indigo-700 flex items-center gap-1">
                <span>Paid (Pro) Stack</span>
                <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded font-black">HIGH RESOLUTION</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">Uses Claude, ElevenLabs (with perfect word sync), and Fal.ai Flux Pro.</div>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-slate-100 flex justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2.5 font-medium text-slate-600 hover:text-slate-900 transition-colors mr-4"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              AI Generating...
            </>
          ) : (
            <>
              <Wand2 size={18} />
              Generate Viral Reel
            </>
          )}
        </button>
      </div>
    </form>
  );
}
