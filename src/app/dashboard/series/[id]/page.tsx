"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Clock, Loader2, Video, Sparkles, Settings, Volume2, Globe, Palette, Type, Trash2, X, Mic, Edit, Wand2, Calendar, Layout, Film } from "lucide-react";
import Link from "next/link";
import { seriesStore } from "@/lib/series/seriesStore";
import { Series, FacelessReel, ArtStyle } from "@/types/series";
import { VoicePicker } from "@/components/VoicePicker";
import { TopicQueue } from "@/components/topics/TopicQueue";
import { REEL_FORMATS, FORMAT_LABELS, FORMAT_DESCRIPTIONS, type ReelFormat } from "@/lib/pipeline/format";


/** In-progress stages, and what to call them in the UI. */
const STAGE_LABELS: Record<string, string> = {
    pending: "Queued",
    scripted: "Writing script",
    voicing: "Recording voiceover",
    visualizing: "Generating images",
    rendering: "Rendering video",
};

export default function SeriesDetailPage() {
    const params = useParams();
    const seriesId = params.id as string;

    const [series, setSeries] = useState<Series | null>(null);
    const [reels, setReels] = useState<FacelessReel[]>([]);
    const [generating, setGenerating] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tempSeries, setTempSeries] = useState<Series | null>(null);
    const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

    const togglePreview = (trackUrl: string) => {
        if (previewAudio) {
            previewAudio.pause();
            if (previewAudio.src.includes(encodeURIComponent(trackUrl)) || previewAudio.src.endsWith(trackUrl)) {
                setPreviewAudio(null);
                return;
            }
        }
        
        // Use proxy only for remote URLs, otherwise use directly (local assets)
        const finalUrl = trackUrl.startsWith('http') 
            ? `/api/audio-proxy?url=${encodeURIComponent(trackUrl)}`
            : trackUrl;
            
        const audio = new Audio(finalUrl);
        audio.volume = 0.3;
        audio.play().catch(e => console.warn("[Preview] Playback failed:", e));
        setPreviewAudio(audio);
        
        audio.onended = () => setPreviewAudio(null);
    };


    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (previewAudio) previewAudio.pause();
        };
    }, [previewAudio]);


    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [genMode, setGenMode] = useState<'auto' | 'custom'>('auto');
    const [customScript, setCustomScript] = useState('');
    const [genNiche, setGenNiche] = useState('');
    const [selectedArtStyle, setSelectedArtStyle] = useState<ArtStyle | 'series_default'>('series_default');
    const [visualStyleOverride, setVisualStyleOverride] = useState('');

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const found = await seriesStore.getById(seriesId);
            if (cancelled || !found) return;
            const enrichedSeries: Series = {
                ...found,
                language: found.language || "english",
                voiceId: found.voiceId || "v1",
                artStyle: found.artStyle || "cinematic",
                captionStyle: found.captionStyle || {
                    type: 'word',
                    animation: 'pop',
                    color: '#FFD700',
                    fontSize: 120,
                    fontFamily: 'Inter',
                    boxEnabled: true,
                    yOffset: 250
                },
                // Music defaults off with no track. This used to default on and
                // point at 'ambient_dream', a bundled file that turned out to be
                // a licensed recording — so a series with no music settings
                // silently published it.
                musicSettings: found.musicSettings || {
                    enabled: false,
                    trackId: '',
                    volume: 0.5
                },
                usePremiumImageStack: found.usePremiumImageStack || false,
                format: found.format || "slideshow"
            };
            setSeries(enrichedSeries);
            setTempSeries(enrichedSeries);
            // getById already returns reels ordered newest-first.
            setReels(found.reels ?? []);
        })();

        return () => { cancelled = true; };
    }, [seriesId]);

    // Music library is whatever is on disk: tracks generated here plus any
    // licensed files dropped into public/music. It used to be a hardcoded list
    // of bundled mp3s that turned out to be someone else's recordings.
    const [tracks, setTracks] = useState<{ id: string; name: string; url: string }[]>([]);
    const [musicPrompt, setMusicPrompt] = useState("");
    const [generatingMusic, setGeneratingMusic] = useState(false);
    const [musicError, setMusicError] = useState<string | null>(null);

    const loadTracks = async () => {
        try {
            const res = await fetch("/api/music");
            setTracks((await res.json()).tracks ?? []);
        } catch { /* leave the list as-is */ }
    };

    useEffect(() => { void loadTracks(); }, []);

    const handleGenerateMusic = async () => {
        if (!musicPrompt.trim()) return;
        setGeneratingMusic(true);
        setMusicError(null);
        try {
            const res = await fetch("/api/music", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: musicPrompt, durationSeconds: 22 }),
            });
            const track = await res.json();
            if (!res.ok) throw new Error(track.error ?? "Generation failed");
            await loadTracks();
            setTempSeries((prev) => prev && ({
                ...prev,
                musicSettings: { ...prev.musicSettings!, enabled: true, trackId: track.id },
            }));
            setMusicPrompt("");
        } catch (e) {
            setMusicError(e instanceof Error ? e.message : "Generation failed");
        } finally {
            setGeneratingMusic(false);
        }
    };

    const handleSaveSettings = async () => {
        if (!tempSeries) return;
        try {
            const saved = await seriesStore.update(seriesId, tempSeries);
            setSeries(saved);
            setTempSeries(saved);
            setIsSettingsOpen(false);
        } catch (e) {
            console.error("Failed to save series settings", e);
            alert(e instanceof Error ? e.message : "Failed to save settings");
        }
    };

    const handleGenerate = async () => {
        if (!series) return;
        setGenerating(true);
        setIsGeneratorOpen(false);
        try {
            const finalArtStyle = selectedArtStyle === 'series_default' ? series.artStyle : selectedArtStyle;

            // The server owns the pipeline now. This returns as soon as the row
            // exists; generation continues even if this tab is closed.
            const reel = await seriesStore.startGeneration(seriesId, {
                // Only send a subject the user typed. Any subject at all makes
                // the server skip the topic queue, so defaulting to the niche
                // here meant "Make this the next reel" never took effect.
                niche: genMode === 'auto' ? genNiche || undefined : series.niche,
                subject: genNiche || undefined,
                customScript: genMode === 'custom' ? customScript : undefined,
                artStyle: finalArtStyle,
                visualStyleOverride,
            });

            setReels(prev => [reel, ...prev]);
        } catch (error) {
            console.error("Failed to start generation", error);
            alert(error instanceof Error ? error.message : "Failed to start generation.");
        } finally {
            setGenerating(false);
            setVisualStyleOverride('');
        }
    };

    // While any reel is mid-pipeline, refresh the list so status and scene
    // count advance without the user reloading.
    const hasReelInFlight = reels.some(r =>
        ["pending", "scripted", "voicing", "visualizing", "rendering"].includes(r.generationStatus),
    );

    useEffect(() => {
        if (!hasReelInFlight) return;
        const timer = setInterval(async () => {
            try {
                setReels(await seriesStore.getReelsForSeries(seriesId));
            } catch {
                // Transient failures are fine; the next tick retries.
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [hasReelInFlight, seriesId]);

    if (!series) return <div className="p-20 text-center text-slate-500 font-medium">Loading series configuration...</div>;

    return (
        <div className="max-w-6xl mx-auto p-8 min-h-screen">
            {/* Generator Dialog (Premium & Fixed Scrolling) */}
            {isGeneratorOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md transition-opacity" onClick={() => setIsGeneratorOpen(false)} />
                    
                    <div className="relative w-full max-w-xl transform overflow-hidden rounded-[3rem] bg-white text-left align-middle shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] transition-all animate-in fade-in zoom-in duration-300 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="p-8 pb-4 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                                    <Wand2 className="text-indigo-600" size={24} />
                                    New Cinematic Reel
                                </h2>
                                <p className="text-slate-500 text-sm mt-1">Configure your story and visual direction.</p>
                            </div>
                            <button onClick={() => setIsGeneratorOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X size={20} className="text-slate-400" />
                            </button>
                        </div>

                        {/* Scrollable Content Area */}
                        <div className="p-8 pt-4 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                            <div className="flex p-1 bg-slate-100 rounded-2xl">
                                <button
                                    onClick={() => setGenMode('auto')}
                                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${genMode === 'auto' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Auto Suggest
                                </button>
                                <button
                                    onClick={() => setGenMode('custom')}
                                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${genMode === 'custom' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Custom Script
                                </button>
                            </div>

                            {genMode === 'custom' ? (
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <Type size={12} /> Who is this about?
                                        </label>
                                        <input
                                            value={genNiche}
                                            onChange={(e) => setGenNiche(e.target.value)}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/30 focus:bg-white transition-all text-base font-medium text-slate-900 mt-2"
                                            placeholder="e.g. Prithviraj Chauhan, Shivaji Maharaj..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <Mic size={12} /> Paste Your Story
                                        </label>
                                        <textarea
                                            value={customScript}
                                            onChange={(e) => setCustomScript(e.target.value)}
                                            rows={5}
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 focus:outline-none focus:border-indigo-500/30 focus:bg-white transition-all text-base font-medium text-slate-900 resize-none mt-2"
                                            placeholder="Type or paste your script here..."
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <Sparkles size={12} /> What is this reel about?
                                    </label>
                                    <input
                                        value={genNiche}
                                        onChange={(e) => setGenNiche(e.target.value)}
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 focus:outline-none focus:border-indigo-500/30 focus:bg-white transition-all text-lg font-medium text-slate-900 mt-2"
                                        placeholder="Leave empty for the next queued topic"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                    <Palette size={12} /> Visual Art Style
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                                    <button
                                        onClick={() => setSelectedArtStyle('series_default')}
                                        className={`p-2.5 rounded-xl border text-[10px] font-bold transition-all ${selectedArtStyle === 'series_default'
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                                            : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-300'
                                            }`}
                                    >
                                        Series Default
                                    </button>
                                    {[
                                        { v: "cinematic_3d", l: "3D Render" },
                                        { v: "anime", l: "Anime" },
                                        { v: "realism", l: "Realism" },
                                        { v: "painting", l: "Painting" },
                                        { v: "mythology", l: "Mythology" },
                                        { v: "dark_fantasy", l: "Dark Fantasy" },
                                        { v: "ghibli", l: "Ghibli" },
                                        { v: "watercolor_illustration", l: "Watercolor" }
                                    ].map((style) => (
                                        <button
                                            key={style.v}
                                            onClick={() => setSelectedArtStyle(style.v as any)}
                                            className={`p-2.5 rounded-xl border text-[10px] font-bold transition-all ${selectedArtStyle === style.v
                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                                                : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-slate-300'
                                                }`}
                                        >
                                            {style.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pb-4">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                    <Sparkles size={12} /> Visual Prompt Override
                                </label>
                                <textarea
                                    value={visualStyleOverride}
                                    onChange={(e) => setVisualStyleOverride(e.target.value)}
                                    rows={2}
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500/30 focus:bg-white transition-all text-sm font-medium text-slate-900 resize-none mt-2"
                                    placeholder="e.g. Add glowing amber eyes, heavy snow falling..."
                                />
                                <p className="text-[10px] text-slate-400 mt-2 font-medium ml-1 italic">Optional: Fine-tune the AI's visual generation for this specific reel.</p>
                            </div>
                        </div>

                        <div className="p-8 border-t bg-slate-50 flex-shrink-0">
                            <button
                                onClick={handleGenerate}
                                className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black text-xl hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-3"
                            >
                                <Sparkles size={24} />
                                Launch Generator
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-12">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/series" className="p-2.5 hover:bg-slate-100 rounded-full transition-colors border border-transparent hover:border-slate-200">
                        <ArrowLeft size={24} className="text-slate-600" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">{series.name}</h1>
                        <p className="text-slate-500 flex items-center gap-2 mt-1 text-sm font-medium">
                            <span className="capitalize">{series.niche.replace("_", " ")}</span>
                            <span>•</span>
                            <span className="capitalize">{series.artStyle.replace("_", " ")}</span>
                            <span>•</span>
                            <span className="text-indigo-600 font-bold capitalize">{series.frequency}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-3 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-200"
                    >
                        <Settings size={22} />
                    </button>
                    <button
                        onClick={() => setIsGeneratorOpen(true)}
                        disabled={generating}
                        className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-8 py-3.5 rounded-xl font-black transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                        {generating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                        Generate New Reel
                    </button>
                </div>
            </div>

            {/* What gets made next, before anything is spent making it. */}
            <TopicQueue seriesId={seriesId} />

            {/* Reels List (Text-focused cards as requested) */}
            <div className="space-y-6">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 ml-2">
                    <Layout size={22} className="text-indigo-600" />
                    Production Library
                </h2>

                {reels.length === 0 && !generating ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
                        <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mx-auto mb-6">
                            <Video size={40} className="text-slate-300" />
                        </div>
                        <h3 className="text-xl font-black text-slate-900">No reels yet</h3>
                        <p className="text-slate-500 mb-8 max-w-sm mx-auto">Your cinematic journey starts here. Click the button above to generate your first AI masterpiece.</p>
                    </div>
                ) : null}

                {generating && (
                    <div className="bg-white rounded-[2.5rem] p-10 border border-indigo-100 shadow-xl shadow-indigo-50/50 flex items-center gap-8 animate-pulse border-l-8 border-l-indigo-600">
                        <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center flex-shrink-0">
                            <Loader2 className="animate-spin text-indigo-600" size={40} />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 text-xl">{genMode === 'custom' ? "Processing your script..." : "AI is crafting your story..."}</h3>
                            <p className="text-base text-slate-500 mt-1 font-medium">
                                {genMode === 'custom'
                                    ? "Segmenting narrative and generating matching visual assets."
                                    : "Scripting, generating cinematic assets, and composing the timeline."}
                            </p>
                        </div>
                    </div>
                )}

                {reels.map((reel, idx) => (
                    <div key={idx} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all overflow-hidden">
                        <div className="px-6 py-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className={`p-3 rounded-xl transition-colors flex-shrink-0 ${
                                    STAGE_LABELS[reel.generationStatus]
                                        ? "bg-indigo-50 text-indigo-600"
                                        : reel.generationStatus === "failed"
                                          ? "bg-red-50 text-red-500"
                                          : "bg-slate-50 group-hover:bg-indigo-50 text-slate-400 group-hover:text-indigo-600"
                                }`}>
                                    {STAGE_LABELS[reel.generationStatus]
                                        ? <Loader2 size={20} className="animate-spin" />
                                        : <Video size={20} />}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-black text-slate-900 truncate text-base">{reel.businessName || "Untitled Reel"}</h3>
                                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-400 mt-0.5">
                                        {/* While the pipeline is running, say which stage it is on
                                            instead of showing a scene count that is still climbing. */}
                                        {STAGE_LABELS[reel.generationStatus] ? (
                                            <span className="text-indigo-600 font-bold flex items-center gap-1">
                                                {STAGE_LABELS[reel.generationStatus]}
                                                {reel.generationStatus === "visualizing" &&
                                                    ` — ${reel.scenes.filter(s => s.backgroundUrl).length}/${reel.scenes.length} images`}
                                            </span>
                                        ) : reel.generationStatus === "failed" ? (
                                            <span className="text-red-600 font-bold">Failed — open to retry</span>
                                        ) : (
                                            <>
                                                <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(reel.createdAt || "").toLocaleDateString()}</span>
                                                <span>·</span>
                                                <span className="text-indigo-500 flex items-center gap-1"><Sparkles size={12} /> {reel.scenes.length} Scenes</span>
                                                <span>·</span>
                                                <span className="capitalize flex items-center gap-1"><Palette size={12} /> {reel.artStyle?.replace(/_/g, ' ')}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                <Link
                                    href={`/dashboard/reels/${reel.id}`}
                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-indigo-600 transition-all flex items-center gap-1.5 whitespace-nowrap"
                                >
                                    <Edit size={13} />
                                    Review &amp; Export
                                </Link>
                                <button
                                    onClick={async () => {
                                        if (!confirm("Delete this reel?")) return;
                                        try {
                                            await seriesStore.deleteReel(reel.id!);
                                            setReels(prev => prev.filter(r => r.id !== reel.id));
                                        } catch (e) {
                                            alert(e instanceof Error ? e.message : "Failed to delete reel");
                                        }
                                    }}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Settings Panel (Premium Sliding Drawer with Fixed Scrolling) */}
            {isSettingsOpen && tempSeries && (
                <div className="fixed inset-0 z-[150] flex justify-end">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsSettingsOpen(false)} />
                    <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900">Series Configuration</h2>
                                <p className="text-sm text-slate-500 font-medium mt-1">Master controls for all generated content.</p>
                            </div>
                            <button onClick={() => setIsSettingsOpen(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors group">
                                <X size={28} className="text-slate-400 group-hover:text-slate-900" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                            <Clock size={14} /> Target Duration
                                        </label>
                                        <select
                                            value={tempSeries.targetDuration}
                                            onChange={(e) => setTempSeries({ ...tempSeries, targetDuration: parseInt(e.target.value) })}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold focus:border-indigo-500/30 outline-none transition-all cursor-pointer"
                                        >
                                            <option value={30}>30 Seconds</option>
                                            <option value={60}>1 Minute</option>
                                            <option value={90}>1.5 Minutes</option>
                                            <option value={180}>3 Minutes</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                            <Globe size={14} /> Narrative Lang
                                        </label>
                                        <select
                                            value={tempSeries.language}
                                            onChange={(e) => setTempSeries({ ...tempSeries, language: e.target.value })}
                                            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-bold focus:border-indigo-500/30 outline-none transition-all cursor-pointer"
                                        >
                                            <option value="english">English</option>
                                            <option value="hindi">Hindi (हिंदी)</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                            <Mic size={14} /> Voice Persona
                                        </label>
                                        {/* The account's real voices, with previews, rather than
                                            six aliases pointing at retired voice ids. */}
                                        <VoicePicker
                                            value={tempSeries.voiceId}
                                            language={tempSeries.language}
                                            onChange={(voiceId) => setTempSeries({ ...tempSeries, voiceId })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Sparkles size={14} /> Series Narrative DNA
                                    </label>
                                    <textarea
                                        value={tempSeries.seriesContext || ''}
                                        onChange={(e) => setTempSeries({ ...tempSeries, seriesContext: e.target.value })}
                                        rows={4}
                                        placeholder="e.g. Biographical Indian history series. Focus on warriors and kings. Emotional, patriotic tone."
                                        className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-medium resize-none focus:border-indigo-500/30 outline-none transition-all"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-2 font-medium ml-1">
                                        This context flows into every script and image prompt in this series.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Palette size={14} /> Global Visual Signature
                                    </label>
                                    <textarea
                                        value={tempSeries.visualStylePrompt || ''}
                                        onChange={(e) => setTempSeries({ ...tempSeries, visualStylePrompt: e.target.value })}
                                        rows={4}
                                        placeholder="e.g. Cinematic lighting, deep shadows, moody atmospheric fog, 8k hyper-realistic textures."
                                        className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-base font-medium resize-none focus:border-indigo-500/30 outline-none transition-all"
                                    />
                                    <p className="text-[11px] text-slate-400 mt-2 font-medium ml-1">
                                        Global aesthetic rules applied to ALL reels in this series.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Palette size={14} /> Base Art Style
                                    </label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {[
                                            { v: "cinematic_3d", l: "3D Render" },
                                            { v: "anime", l: "Anime" },
                                            { v: "realism", l: "Realism" },
                                            { v: "painting", l: "Painting" },
                                            { v: "ghibli", l: "Ghibli" },
                                            { v: "watercolor_illustration", l: "Watercolor" },
                                            { v: "pixel_art", l: "Pixel Art" },
                                            { v: "mythology", l: "Mythology" },
                                            { v: "dark_fantasy", l: "Dark Fantasy" },
                                            { v: "comic", l: "Comic" },
                                            { v: "creepy_comic", l: "Creepy Comic" },
                                            { v: "modern_cartoon", l: "Modern Cartoon" },
                                            { v: "disney", l: "Disney" },
                                            { v: "lego", l: "LEGO" },
                                            { v: "polaroid", l: "Polaroid" },
                                            { v: "fantastic", l: "Fantastic" }
                                        ].map((style) => (
                                            <button
                                                key={style.v}
                                                onClick={() => setTempSeries({ ...tempSeries, artStyle: style.v as any })}
                                                className={`p-3.5 rounded-2xl border-2 text-[11px] font-black transition-all ${tempSeries.artStyle === style.v
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100'
                                                        : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                                                    }`}
                                            >
                                                {style.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 space-y-4">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Sparkles size={14} /> AI Generation Stack
                                    </label>
                                    <div className="bg-slate-50 p-6 rounded-[2rem] space-y-4 border-2 border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="text-base font-black text-slate-800 block">Premium (Pro) Stack</span>
                                                <span className="text-[10px] text-slate-400 font-bold block mt-0.5">Claude + ElevenLabs + Fal.ai</span>
                                            </div>
                                            <button
                                                onClick={() => setTempSeries({
                                                    ...tempSeries,
                                                    usePremiumImageStack: !tempSeries.usePremiumImageStack
                                                })}
                                                className={`w-14 h-8 rounded-full transition-all relative ${tempSeries.usePremiumImageStack ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                            >
                                                <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all shadow-md ${tempSeries.usePremiumImageStack ? 'left-7.5' : 'left-1.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 space-y-4">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Film size={14} /> Shot Format
                                    </label>
                                    <div className="grid grid-cols-1 gap-3">
                                        {REEL_FORMATS.map((option) => {
                                            const active = (tempSeries.format ?? "slideshow") === option;
                                            return (
                                                <button
                                                    key={option}
                                                    onClick={() => setTempSeries({ ...tempSeries, format: option as ReelFormat })}
                                                    className={`text-left p-5 rounded-[2rem] border-2 transition-all ${
                                                        active
                                                            ? "border-indigo-600 bg-indigo-50"
                                                            : "border-slate-100 bg-slate-50 hover:border-slate-200"
                                                    }`}
                                                >
                                                    <span className={`text-base font-black block ${active ? "text-indigo-700" : "text-slate-800"}`}>
                                                        {FORMAT_LABELS[option]}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 font-bold block mt-1 leading-relaxed">
                                                        {FORMAT_DESCRIPTIONS[option]}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="pt-4 space-y-4">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Volume2 size={14} /> Atmospheric Audio
                                    </label>
                                    <div className="bg-slate-50 p-6 rounded-[2rem] space-y-6 border-2 border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <span className="text-base font-black text-slate-800">Background Music</span>
                                            <button
                                                onClick={() => setTempSeries({
                                                    ...tempSeries,
                                                    musicSettings: { ...tempSeries.musicSettings!, enabled: !tempSeries.musicSettings?.enabled }
                                                })}
                                                className={`w-14 h-8 rounded-full transition-all relative ${tempSeries.musicSettings?.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                            >
                                                <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all shadow-md ${tempSeries.musicSettings?.enabled ? 'left-7.5' : 'left-1.5'}`} />
                                            </button>
                                        </div>
                                        {tempSeries.musicSettings?.enabled && (
                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                                        <Volume2 size={12} /> Select Atmosphere
                                                    </div>

                                                    {/* Generate an original bed instead of shipping
                                                        someone else's recording. */}
                                                    <div className="p-3 rounded-2xl border-2 border-dashed border-slate-200 space-y-2">
                                                        <input
                                                            value={musicPrompt}
                                                            onChange={(e) => setMusicPrompt(e.target.value)}
                                                            placeholder="e.g. slow tabla and sarangi, mournful historical underscore"
                                                            className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium outline-none focus:border-indigo-500/30"
                                                        />
                                                        <button
                                                            onClick={handleGenerateMusic}
                                                            disabled={generatingMusic || !musicPrompt.trim()}
                                                            className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-indigo-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold text-sm transition-colors"
                                                        >
                                                            {generatingMusic
                                                                ? <><Loader2 size={14} className="animate-spin" /> Composing…</>
                                                                : <><Wand2 size={14} /> Generate original track</>}
                                                        </button>
                                                        {musicError && (
                                                            <p className="text-xs text-red-600">{musicError}</p>
                                                        )}
                                                        {tracks.length === 0 && !generatingMusic && (
                                                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                                                No tracks yet. Generate one above, or drop your own
                                                                licensed mp3 files into <code>public/music/</code>.
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {tracks.map((track) => (
                                                            <div 
                                                                key={track.id}
                                                                className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                                                                    tempSeries.musicSettings?.trackId === track.id
                                                                        ? 'bg-white border-indigo-600 shadow-md'
                                                                        : 'bg-white/50 border-slate-100 hover:border-slate-200'
                                                                }`}
                                                            >
                                                                <button
                                                                    onClick={() => setTempSeries({
                                                                        ...tempSeries,
                                                                        musicSettings: { ...tempSeries.musicSettings!, trackId: track.id }
                                                                    })}
                                                                    className="flex-1 text-left"
                                                                >
                                                                    <div className="text-sm font-bold text-slate-900">{track.name}</div>
                                                                    <div className="text-[10px] text-slate-400 font-bold uppercase">generated / added</div>
                                                                </button>
                                                                <button
                                                                    onClick={() => togglePreview(track.url)}
                                                                    className={`p-2 rounded-xl transition-all ${
                                                                        previewAudio?.src.includes(encodeURIComponent(track.url))
                                                                            ? 'bg-indigo-600 text-white'
                                                                            : 'bg-slate-100 text-slate-400 hover:text-indigo-600'
                                                                    }`}
                                                                >
                                                                    {previewAudio?.src.includes(encodeURIComponent(track.url)) ? <X size={14} /> : <Volume2 size={14} />}
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="flex justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                                        <span>Mix Level</span>
                                                        <span className="text-indigo-600">{Math.round((tempSeries.musicSettings.volume || 0.5) * 100)}%</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0" max="1" step="0.01"
                                                        value={tempSeries.musicSettings.volume}
                                                        onChange={(e) => setTempSeries({
                                                            ...tempSeries,
                                                            musicSettings: { ...tempSeries.musicSettings!, volume: parseFloat(e.target.value) }
                                                        })}
                                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                </div>

                                <div className="pt-4 pb-12 space-y-4">
                                    <label className="text-xs font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest ml-1">
                                        <Type size={14} /> Dynamic Captioning
                                    </label>
                                    {/* Same three styles the create wizard offers. */}
                                    <div className="grid grid-cols-3 gap-3">
                                        {([
                                            { type: 'word', title: 'Word Pops', hint: 'High retention, one word at a time.' },
                                            { type: 'phrase', title: 'Short Phrase', hint: 'Up to three words on screen.' },
                                            { type: 'sentence', title: 'Sentence', hint: 'Classic subtitles for clear reading.' },
                                        ] as const).map(option => (
                                            <button
                                                key={option.type}
                                                onClick={() => setTempSeries({
                                                    ...tempSeries,
                                                    captionStyle: { ...tempSeries.captionStyle!, type: option.type }
                                                })}
                                                className={`p-5 rounded-[2rem] border-2 text-left transition-all ${tempSeries.captionStyle?.type === option.type
                                                        ? 'bg-indigo-50 border-indigo-600 shadow-xl shadow-indigo-50/50'
                                                        : 'bg-white border-slate-100 hover:border-slate-300'
                                                    }`}
                                            >
                                                <p className="text-base font-black text-slate-900">{option.title}</p>
                                                <p className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">{option.hint}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-8 border-t bg-white flex-shrink-0">
                            <button 
                                onClick={handleSaveSettings} 
                                className="w-full bg-slate-900 text-white py-5 rounded-[2rem] font-black text-xl hover:bg-indigo-600 hover:scale-[1.01] active:scale-95 transition-all shadow-2xl shadow-slate-100"
                            >
                                Deploy Configuration
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
