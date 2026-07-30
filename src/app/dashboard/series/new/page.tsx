"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Wand2, Check, Music, Globe, Type, Languages } from "lucide-react";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import { seriesStore } from "../../../../lib/series/seriesStore";
import { NicheType, ArtStyle, Series } from "../../../../types/series";
import { getDefaultMusic } from "../../../../lib/music";

const NICHES: { value: NicheType; label: string; description: string }[] = [
    { value: "mythology", label: "Mythology", description: "Ancient legends and god stories" },
    { value: "scary_stories", label: "Scary Stories", description: "Urban legends and horror tales" },
    { value: "history", label: "History", description: "Fascinating historical events" },
    { value: "ai_news", label: "AI News", description: "Latest breakthroughs in AI" },
    { value: "motivation", label: "Motivation", description: "Daily inspiration and discipline" },
    { value: "school_gossip", label: "School Gossip", description: "Drama and anonymous stories" }
];

const STYLES: { value: ArtStyle; label: string }[] = [
    { value: "cinematic_3d", label: "Cinematic 3D" },
    { value: "anime", label: "Anime Style" },
    { value: "disney", label: "Disney & Pixar" },
    { value: "painting", label: "Oil Painting" },
    { value: "watercolor_illustration", label: "Watercolor" },
    { value: "polaroid", label: "Polaroid Vintage" },
    { value: "modern_cartoon", label: "Modern Cartoon" },
    { value: "dark_fantasy", label: "Dark Fantasy" },
    { value: "realism", label: "Realism" },
    { value: "creepy_comic", label: "Creepy Comic / Noir" }
];

const LANGUAGES = [
    { value: "english", label: "English (US)" },
    { value: "spanish", label: "Spanish" },
    { value: "french", label: "French" },
    { value: "german", label: "German" },
    { value: "hindi", label: "Hindi" }
];

const VOICES = [
    // Ranks the account's voices by language and by how their ElevenLabs
    // use_case tag fits the niche, so a history series gets a narrator and a
    // Hindi series gets a Hindi voice.
    { value: "auto", label: "Auto — match to series" },
    { value: "antoni", label: "Antoni (Deep Narrative)" },
    { value: "bella", label: "Bella (Soft Storyteller)" },
    { value: "arnold", label: "Arnold (Strong Voice)" },
    { value: "josh", label: "Josh (Energetic)" }
];

const CAPTION_STYLES = [
    { value: "word", label: "Single Word", description: "One word at a time (Viral style)" },
    { value: "phrase", label: "Short Phrase", description: "Up to 3 words per line" },
    { value: "sentence", label: "Full Line", description: "Classic subtitle style" }
];

export default function NewSeriesPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        niche: "mythology" as NicheType,
        artStyle: "cinematic_3d" as ArtStyle,
        frequency: "daily",
        targetDuration: 60,
        platforms: ["tiktok"] as string[],
        language: "english",
        voiceId: "auto",
        captionStyle: "word",
        captionColor: "#FFD700",
        seriesContext: "",
        usePremiumImageStack: false
    });

    const [previewContent, setPreviewContent] = useState<any>(null);

    const [launching, setLaunching] = useState(false);
    const [launchError, setLaunchError] = useState<string | null>(null);

    const handleLaunch = async () => {
        const newSeries: Series = {
            id: uuidv4(),
            name: formData.name,
            niche: formData.niche,
            artStyle: formData.artStyle,
            language: formData.language,
            voiceId: formData.voiceId,
            frequency: formData.frequency as any,
            targetDuration: formData.targetDuration,
            targetPlatforms: formData.platforms as any,
            status: "active",
            seriesContext: formData.seriesContext || undefined,
            usePremiumImageStack: formData.usePremiumImageStack,
            musicSettings: {
                enabled: true,
                trackId: getDefaultMusic().id,
                volume: 0.5
            },
            captionStyle: {
                type: formData.captionStyle as any,
                animation: 'pop',
                color: formData.captionColor,
                fontSize: 120,
                fontFamily: 'Inter',
                boxEnabled: true
            },
            reels: [],
            createdAt: new Date()
        };
        setLaunching(true);
        setLaunchError(null);
        try {
            await seriesStore.create(newSeries);
            router.push("/dashboard/series");
        } catch (e) {
            // Stay on the form so the filled-in settings are not lost.
            setLaunchError(e instanceof Error ? e.message : "Failed to create series");
            setLaunching(false);
        }
    };

    const handleGeneratePreview = async () => {
        setLoading(true);
        try {
            // Only the script is shown, so only the script is generated. This
            // used to run the whole pipeline — voiceover, transcription and one
            // image per scene — to display 150 characters of text, for a series
            // that did not exist yet and a reel that was thrown away.
            const res = await fetch("/api/series/generate-script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    niche: formData.niche,
                    language: formData.language,
                    durationInSeconds: formData.targetDuration,
                    artStyle: formData.artStyle,
                    subject: formData.name || formData.niche,
                    seriesContext: formData.seriesContext || undefined,
                    usePremium: formData.usePremiumImageStack,
                }),
            });
            if (!res.ok) throw new Error("Preview generation failed");
            setPreviewContent(await res.json());
        } catch (e) {
            console.error(e);
            setLaunchError(e instanceof Error ? e.message : "Preview failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8">
            <Link href="/dashboard/series" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 transition-colors">
                <ArrowLeft size={18} />
                Back to Series
            </Link>

            <div className="mb-12">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Create a Series</h1>
                <p className="text-slate-500 mt-2">Configure your automated AI video channel</p>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-4 mb-12">
                {[1, 2, 3, 4, 5].map((s) => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                            }`}>
                            {step > s ? <Check size={16} /> : s}
                        </div>
                        {s < 5 && <div className={`h-1 w-12 rounded ${step > s ? "bg-indigo-600" : "bg-slate-100"}`} />}
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                {step === 1 && (
                    <div className="space-y-8 animate-[fadeIn_300ms_ease-out]">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Series Identity</label>
                            <input
                                type="text"
                                placeholder="e.g. Ancient Legends Daily"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-1 uppercase tracking-wider">
                                Series Context <span className="text-slate-400 font-normal normal-case">(optional but recommended)</span>
                            </label>
                            <p className="text-xs text-slate-400 mb-3">
                                Describe the tone, subject focus, and style. This flows into every script and image in this series.
                            </p>
                            <textarea
                                rows={3}
                                placeholder="e.g. Biographical Indian history series. Focus on warriors and kings of medieval India. Emotional, patriotic tone. Each video covers one historical figure in 60 seconds."
                                value={formData.seriesContext}
                                onChange={e => setFormData({ ...formData, seriesContext: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm resize-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Target Niche</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {NICHES.map(n => (
                                    <button
                                        key={n.value}
                                        onClick={() => setFormData({ ...formData, niche: n.value })}
                                        className={`text-left p-4 rounded-xl border transition-all ${formData.niche === n.value
                                                ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        <p className="font-bold text-slate-900">{n.label}</p>
                                        <p className="text-xs text-slate-500 mt-1">{n.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            disabled={!formData.name}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-xl font-bold text-lg transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                        >
                            Next: Creative Style
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-8 animate-[fadeIn_300ms_ease-out]">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Visual Art Style</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {STYLES.map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => setFormData({ ...formData, artStyle: s.value })}
                                        className={`p-4 rounded-xl border transition-all text-sm font-medium ${formData.artStyle === s.value
                                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Frequency & Duration</label>
                            <div className="flex gap-4 mb-4">
                                {["daily", "weekly", "manual"].map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFormData({ ...formData, frequency: f })}
                                        className={`flex-1 p-3 rounded-xl border transition-all text-sm font-medium capitalize ${formData.frequency === f
                                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { v: 60, l: "1 min" },
                                    { v: 180, l: "3 min" },
                                    { v: 300, l: "5 min" }
                                ].map(d => (
                                    <button
                                        key={d.v}
                                        onClick={() => setFormData({ ...formData, targetDuration: d.v })}
                                        className={`p-3 rounded-xl border transition-all text-sm font-medium ${formData.targetDuration === d.v
                                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        {d.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">AI Generation Stack</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setFormData({ ...formData, usePremiumImageStack: false })}
                                    className={`text-left p-5 rounded-xl border transition-all ${!formData.usePremiumImageStack
                                            ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100"
                                            : "border-slate-200 hover:border-slate-300"
                                        }`}
                                >
                                    <p className="font-bold text-slate-900">Free Stack</p>
                                    <p className="text-xs text-slate-500 mt-1">Script by Groq or Gemini, images from Together or Pollinations. No paid image calls.</p>
                                </button>
                                <button
                                    onClick={() => setFormData({ ...formData, usePremiumImageStack: true })}
                                    className={`text-left p-5 rounded-xl border transition-all ${formData.usePremiumImageStack
                                            ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-100"
                                            : "border-slate-200 hover:border-slate-300"
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-indigo-700">Paid (Pro) Stack</p>
                                        <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded font-black">PREMIUM</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">Script by Claude, images from Fal.ai Flux Pro.</p>
                                </button>
                            </div>
                            {/* Azure was removed; ElevenLabs is the only voice provider, so
                                the stack choice no longer affects the voiceover at all. */}
                            <p className="text-xs text-slate-400 mt-3">
                                Voiceover uses ElevenLabs on both, including word-level caption sync.
                            </p>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button onClick={() => setStep(1)} className="flex-1 bg-slate-100 text-slate-700 py-4 rounded-xl font-bold">Back</button>
                            <button onClick={() => setStep(3)} className="flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-bold">Next: Voice & Audio</button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-8 animate-[fadeIn_300ms_ease-out]">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Voiceover Language</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {LANGUAGES.map(l => (
                                    <button
                                        key={l.value}
                                        onClick={() => setFormData({ ...formData, language: l.value })}
                                        className={`p-4 rounded-xl border transition-all text-sm font-medium flex items-center gap-2 ${formData.language === l.value
                                                ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        <Languages size={16} />
                                        {l.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Voice Character</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {VOICES.map(v => (
                                    <button
                                        key={v.value}
                                        onClick={() => setFormData({ ...formData, voiceId: v.value })}
                                        className={`text-left p-4 rounded-xl border transition-all ${formData.voiceId === v.value
                                                ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 text-slate-900 font-bold">
                                            <Music size={16} className="text-indigo-500" />
                                            {v.label}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button onClick={() => setStep(2)} className="flex-1 bg-slate-100 text-slate-700 py-4 rounded-xl font-bold">Back</button>
                            <button onClick={() => setStep(4)} className="flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-bold">Next: Captions Styling</button>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="space-y-8 animate-[fadeIn_300ms_ease-out]">
                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Caption Layout</label>
                            <div className="grid grid-cols-1 gap-4">
                                {CAPTION_STYLES.map(c => (
                                    <button
                                        key={c.value}
                                        onClick={() => setFormData({ ...formData, captionStyle: c.value })}
                                        className={`text-left p-4 rounded-xl border transition-all ${formData.captionStyle === c.value
                                                ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-100"
                                                : "border-slate-200 hover:border-slate-300"
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Type className="text-indigo-500" size={20} />
                                            <div>
                                                <p className="font-bold text-slate-900">{c.label}</p>
                                                <p className="text-xs text-slate-500">{c.description}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider">Accent Color</label>
                            <div className="flex gap-4">
                                {["#FFD700", "#FF4D4D", "#4DFF88", "#4D94FF", "#FFFFFF"].map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setFormData({ ...formData, captionColor: color })}
                                        className={`w-12 h-12 rounded-full border-4 transition-all ${formData.captionColor === color ? "border-indigo-600 scale-110" : "border-transparent"
                                            }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button onClick={() => setStep(3)} className="flex-1 bg-slate-100 text-slate-700 py-4 rounded-xl font-bold">Back</button>
                            <button onClick={() => setStep(5)} className="flex-[2] bg-indigo-600 text-white py-4 rounded-xl font-bold">Review & Launch</button>
                        </div>
                    </div>
                )}

                {step === 5 && (
                    <div className="space-y-8 animate-[fadeIn_300ms_ease-out]">
                        <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200">
                            <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                                <Check className="text-green-500" />
                                Series Summary
                            </h3>

                            <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Name</p>
                                    <p className="font-bold text-slate-800">{formData.name}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Niche</p>
                                    <p className="font-bold text-slate-800 capitalize">{formData.niche.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Visual Style</p>
                                    <p className="font-bold text-slate-800 capitalize">{formData.artStyle.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Language</p>
                                    <p className="font-bold text-slate-800 capitalize">{formData.language}</p>
                                </div>
                            </div>

                            {!previewContent ? (
                                <button
                                    onClick={handleGeneratePreview}
                                    className="mt-8 w-full py-3 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                                >
                                    {loading ? <Sparkles className="animate-spin" size={18} /> : <Wand2 size={18} />}
                                    {loading ? "AI is generating a test script..." : "Generate AI Sample (Optional)"}
                                </button>
                            ) : (
                                <div className="mt-8 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <p className="text-[10px] font-bold text-indigo-400 uppercase mb-2">Sample AI Script</p>
                                    <p className="text-sm italic text-slate-700">"{previewContent.script.substring(0, 150)}..."</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button onClick={() => setStep(4)} className="flex-1 bg-slate-100 text-slate-700 py-4 rounded-xl font-bold">Back</button>
                            <button
                                onClick={handleLaunch}
                                disabled={launching}
                                className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                            >
                                <Globe size={20} />
                                {launching ? "Creating…" : "Launch Series"}
                            </button>
                        </div>
                        {launchError && (
                            <p className="mt-3 text-sm text-red-600 text-center">{launchError}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
