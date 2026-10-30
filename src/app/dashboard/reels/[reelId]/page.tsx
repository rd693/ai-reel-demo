"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Video, Share2, Sparkles, Palette, Type, Check, Download, Trash2, Clock, RefreshCw, Film } from "lucide-react";
import dynamic from "next/dynamic";
import { seriesStore, type RenderJob } from "@/lib/series/seriesStore";
import { resolveMediaUrl } from "@/lib/media/resolveMediaUrl";
import { Series, FacelessReel } from "@/types/series";
import { createTimeline } from "@/agents/timelineAgent";
import { PublishCopyPanel } from "@/components/PublishCopyPanel";

const FacelessReelComposition = dynamic(() => import("@/compositions/FacelessReelComposition").then(mod => mod.FacelessReelComposition), { ssr: false });
const Player = dynamic(() => import("@remotion/player").then(mod => mod.Player), { ssr: false });

/**
 * Stages the pipeline passes through, and what to call them. A reel opened
 * mid-generation used to render as a player over half-written data: empty
 * image URLs became broken thumbnails and the preview played nothing.
 */
/** Whether a stored background is a clip rather than a still. */
const isFootage = (url?: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url ?? "");

const GENERATION_STAGES: { key: string; label: string }[] = [
    { key: "pending", label: "Queued" },
    { key: "scripted", label: "Writing script" },
    { key: "voicing", label: "Recording voiceover" },
    { key: "visualizing", label: "Generating images" },
    { key: "rendering", label: "Rendering video" },
];

export default function ReelDetailPage() {
    const params = useParams();
    const router = useRouter();
    const reelId = params.reelId as string;

    const [reel, setReel] = useState<FacelessReel | null>(null);
    const [series, setSeries] = useState<Series | null>(null);
    const [renderingStatus, setRenderingStatus] = useState<Partial<RenderJob> | null>(null);
    const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);

    const [assetsLoaded, setAssetsLoaded] = useState(false);
    const [preloadedCount, setPreloadedCount] = useState(0);
    const [totalPreloadCount, setTotalPreloadCount] = useState(0);

    // Eager asset preloader to guarantee frame-perfect visual paints and 0ms audio buffering
    useEffect(() => {
        if (!reel) return;
        // Nothing to preload until the pipeline has finished writing assets;
        // half the URLs would be missing and each one costs a failed request.
        if (GENERATION_STAGES.some(s => s.key === reel.generationStatus)) return;

        const baseHost = window.location.origin;
        const imageUrls = reel.scenes.map((scene, i) => {
            const rawUrl = scene.backgroundUrl || (scene as any).imageUrl;
            if (!rawUrl) return null;
            return resolveMediaUrl(rawUrl, baseHost, scene.id || i);
        }).filter(Boolean) as string[];

        const audioUrl = reel.voiceoverUrl 
            ? (reel.voiceoverUrl.startsWith('http') 
                ? `${baseHost}/api/audio-proxy?url=${encodeURIComponent(reel.voiceoverUrl)}&v=vo`
                : reel.voiceoverUrl.startsWith('/')
                    ? `${baseHost}${reel.voiceoverUrl}`
                    : reel.voiceoverUrl)
            : null;

        const assets = [...imageUrls];
        if (audioUrl) {
            assets.push(audioUrl);
        }

        if (assets.length === 0) {
            setAssetsLoaded(true);
            return;
        }

        setTotalPreloadCount(assets.length);
        setPreloadedCount(0);
        setAssetsLoaded(false);

        let loaded = 0;
        let isCancelled = false;

        const handleAssetLoad = () => {
            if (isCancelled) return;
            loaded += 1;
            setPreloadedCount(loaded);
            if (loaded >= assets.length) {
                setAssetsLoaded(true);
            }
        };

        assets.forEach(url => {
            const isAudio = url.includes('audio-proxy') || url.endsWith('.mp3') || url.endsWith('.wav') || url.startsWith('data:audio');
            // Footage is streamed by the player rather than held in memory;
            // handing a .mp4 to `new Image()` only produces a decode error.
            if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) {
                handleAssetLoad();
            } else if (isAudio) {
                const audio = new Audio();
                audio.src = url;
                audio.addEventListener('canplaythrough', handleAssetLoad, { once: true });
                audio.addEventListener('error', () => {
                    console.warn("[Preloader] Failed to preload audio:", url);
                    handleAssetLoad();
                }, { once: true });
                audio.load();
            } else {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = url;
                if (img.complete) {
                    handleAssetLoad();
                } else {
                    img.onload = handleAssetLoad;
                    img.onerror = () => {
                        console.warn("[Preloader] Failed to preload image:", url);
                        handleAssetLoad();
                    };
                }
            }
        });

        return () => {
            isCancelled = true;
        };
    }, [reel]);


    useEffect(() => {
        let cancelled = false;

        (async () => {
            // Reels are addressable by id, so this is a direct lookup rather
            // than a scan of every series' reels.
            const found = await seriesStore.getReel(reelId);
            if (cancelled || !found) return;

            // Older reels predate seeded image generation; give them one so
            // regenerating a single scene stays visually consistent.
            if (!found.seed) {
                found.seed = Math.floor(Math.random() * 2147483647);
                await seriesStore.updateReel(reelId, { seed: found.seed });
            }

            if (cancelled) return;
            setReel(found);
            setSeries(await seriesStore.getById(found.seriesId));
        })();

        return () => { cancelled = true; };
    }, [reelId]);

    // Generation runs on the server and survives this tab, so the page has to
    // ask for the current state rather than assume the row it first loaded is
    // final.
    const stageIndex = GENERATION_STAGES.findIndex(s => s.key === reel?.generationStatus);
    const isGenerating = stageIndex !== -1;

    useEffect(() => {
        if (!isGenerating || !reelId) return;

        let cancelled = false;
        const timer = setInterval(async () => {
            try {
                const fresh = await seriesStore.getReel(reelId);
                if (!cancelled && fresh) setReel(fresh);
            } catch {
                // Ignore a dropped poll; the next tick retries.
            }
        }, 3000);

        return () => { cancelled = true; clearInterval(timer); };
    }, [reelId, isGenerating]);

    const handleResume = async () => {
        if (!reelId) return;
        try {
            setReel(await seriesStore.resumeGeneration(reelId));
        } catch (e) {
            alert(e instanceof Error ? e.message : "Failed to resume generation");
        }
    };

    const handleRenderReel = async () => {
        if (!reel || !reel.id) return;

        setRenderingStatus({ progress: 0, status: 'processing' });

        try {
            // The server reads the reel from the database, so the render always
            // matches what was saved rather than whatever this tab holds.
            await seriesStore.startRender(reel.id);
        } catch (error) {
            console.error("Failed to start render", error);
            setRenderingStatus({
                progress: 0,
                status: 'failed',
                error: error instanceof Error ? error.message : undefined,
            });
        }
    };

    // Render progress lives in the database, so polling picks up a job that was
    // started before this page was even opened.
    const renderInFlight = renderingStatus?.status === 'processing' || renderingStatus?.status === 'queued';

    useEffect(() => {
        if (!reel?.id) return;

        let cancelled = false;
        const poll = async () => {
            try {
                const job = await seriesStore.getRenderJob(reel.id!);
                if (!cancelled && job) setRenderingStatus(job);
            } catch {
                // Ignore a dropped poll; the next tick retries.
            }
        };

        void poll(); // Surface an already-running job on first load.
        if (!renderInFlight) return;

        const timer = setInterval(poll, 2000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [reel?.id, renderInFlight]);

    const handleDelete = async () => {
        if (!series || !reel || !reel.id) return;
        if (!confirm("Are you sure you want to delete this reel?")) return;
        try {
            await seriesStore.deleteReel(reel.id);
            router.push(`/dashboard/series/${series.id}`);
        } catch (e) {
            alert(e instanceof Error ? e.message : "Failed to delete reel");
        }
    };

    const handlePromptChange = (index: number, newPrompt: string) => {
        if (!reel || !reel.id) return;

        const updatedScenes = [...reel.scenes];
        updatedScenes[index] = { ...updatedScenes[index], visualPrompt: newPrompt };

        const updatedReel = { ...reel, scenes: updatedScenes };
        setReel(updatedReel);
        // Typing in the prompt box fires this per keystroke; persistence is
        // fire-and-forget so the field stays responsive.
        void seriesStore.updateReel(reel.id, { scenes: updatedScenes }).catch((e) =>
            console.error("Failed to persist prompt change", e),
        );
    };

    const handleRegenerate = async (index: number) => {
        if (!reel || !series) return;
        const scene = reel.scenes[index];
        const prompt = scene.visualPrompt;

        if (!prompt) {
            alert("Please enter a visual prompt first.");
            return;
        }

        setRegeneratingIndex(index);

        try {
            const response = await fetch('/api/images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    artStyle: reel.artStyle || series.artStyle || 'cinematic_3d',
                    // Same derivation as the pipeline, so regenerating one
                    // shot does not jump to a different composition.
                    seed: ((reel as any).seed ?? 0) + index,
                    usePremium: reel.usePremiumImageStack || series.usePremiumImageStack ? true : false
                }),
            });

            if (!response.ok) throw new Error("Failed to generate image");

            const { imageUrl } = await response.json();
            
            if (!imageUrl) throw new Error("No image URL returned");

            const updatedScenes = [...reel.scenes];
            updatedScenes[index] = { ...updatedScenes[index], backgroundUrl: imageUrl };
            
            const updatedReel = { ...reel, scenes: updatedScenes };
            setReel(updatedReel);
            await seriesStore.updateReel(reel.id!, { scenes: updatedScenes });

        } catch (error) {
            console.error("Regeneration failed", error);
            alert("Failed to regenerate image. Please try again.");
        } finally {
            setRegeneratingIndex(null);
        }
    };

    if (!reel || !series) return <div className="p-20 text-center text-slate-500 font-medium">Loading reel details...</div>;

    const maxMs = (() => {
        const timeline = createTimeline(reel, { audioUrl: reel.voiceoverUrl });
        const lastAudioEnd = timeline.audio.reduce((max, a) => Math.max(max, a.endMs), 0);
        const lastTextEnd = timeline.text.reduce((max, t) => Math.max(max, t.endMs), 0);
        const maxTime = Math.max(lastAudioEnd, lastTextEnd);

        if (maxTime === 0) {
            const raw = reel.actualDuration || 60;
            const sec = raw > 500 ? raw / 1000 : raw;
            return sec * 1000;
        }
        return maxTime;
    })();

    const durationInFrames = Math.round((maxMs / 1000) * 30);

    return (
        <div className="max-w-6xl mx-auto p-8">
            <div className="sticky top-0 z-[100] bg-white/95 backdrop-blur-md -mx-8 px-8 py-6 mb-8 border-b border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push(`/dashboard/series/${series.id}`)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 leading-tight">{reel.businessName || "Untitled Reel"}</h1>
                        <p className="text-slate-500 flex items-center gap-2 mt-1 font-medium text-sm">
                            <span className="bg-slate-100 px-2 py-0.5 rounded-md">Series: {series.name}</span>
                            <span>•</span>
                            <span>{new Date(reel.createdAt || "").toLocaleDateString()}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleDelete}
                        className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 font-bold text-sm"
                        title="Delete Reel"
                    >
                        <Trash2 size={18} />
                    </button>
                    <button
                        onClick={handleRenderReel}
                        // Exporting mid-generation would render whatever scenes
                        // happen to exist so far.
                        disabled={renderingStatus?.status === 'processing' || isGenerating}
                        className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                            renderingStatus?.status === 'completed'
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 disabled:bg-indigo-300'
                        }`}
                    >
                        {renderingStatus?.status === 'processing' ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                {renderingStatus.progress}%
                            </>
                        ) : renderingStatus?.status === 'completed' ? (
                            <>
                                <Check size={18} />
                                Rendered
                            </>
                        ) : (
                            <>
                                <Download size={18} />
                                Export
                            </>
                        )}
                    </button>
                    {renderingStatus?.outputPath && (
                        <a
                            href={renderingStatus.outputPath}
                            download={`reel-${reel.id}.mp4`}
                            className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-3 rounded-xl transition-colors font-bold flex items-center gap-2 text-sm border border-indigo-100"
                        >
                            <Share2 size={18} />
                            Download
                        </a>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Left Column: Player & Actions */}
                <div className="lg:col-span-4 space-y-8">
                    {/* Capped width: at 5/12 of a 6xl page the mockup filled the
                        viewport and pushed the scene list off-screen. */}
                    <div className="sticky top-32 max-w-[260px] mx-auto">
                        <div className="bg-black rounded-[2rem] overflow-hidden shadow-[0_24px_48px_-16px_rgba(0,0,0,0.4)] w-full aspect-[9/16] border-4 border-slate-900 relative">
                            {isGenerating ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
                                    <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-5" />
                                    <h3 className="text-base font-bold text-white mb-4 tracking-tight">
                                        {GENERATION_STAGES[stageIndex].label}…
                                    </h3>
                                    <div className="w-full space-y-1.5 text-left">
                                        {GENERATION_STAGES.map((stage, i) => (
                                            <div
                                                key={stage.key}
                                                className={`flex items-center gap-2 text-[11px] font-bold ${
                                                    i < stageIndex ? "text-green-400"
                                                        : i === stageIndex ? "text-white"
                                                        : "text-slate-600"
                                                }`}
                                            >
                                                {i < stageIndex
                                                    ? <Check size={12} />
                                                    : i === stageIndex
                                                      ? <Loader2 size={12} className="animate-spin" />
                                                      : <Clock size={12} />}
                                                {stage.label}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-slate-500 text-[11px] leading-relaxed font-medium mt-5">
                                        Runs on the server — you can close this tab.
                                    </p>
                                </div>
                            ) : reel.generationStatus === "failed" ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
                                    <h3 className="text-base font-bold text-red-400 mb-2">Generation failed</h3>
                                    <p className="text-slate-400 text-[11px] leading-relaxed font-medium mb-5">
                                        {reel.generationError || "The pipeline stopped before finishing."}
                                        {" "}Resuming picks up from the last completed stage rather than
                                        starting over.
                                    </p>
                                    <button
                                        onClick={handleResume}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2"
                                    >
                                        <RefreshCw size={14} /> Resume
                                    </button>
                                </div>
                            ) : assetsLoaded ? (
                                <Player
                                    key={reel.id}
                                    component={FacelessReelComposition as any}
                                    inputProps={{
                                        reel: {
                                            ...reel,
                                            baseHost: window.location.origin
                                        },
                                        captionStyle: reel.captionStyle || series.captionStyle,
                                        musicSettings: reel.musicSettings || series.musicSettings
                                    }}
                                    durationInFrames={durationInFrames}
                                    fps={30}
                                    compositionWidth={1080}
                                    compositionHeight={1920}
                                    style={{ width: '100%', height: '100%' }}
                                    controls
                                    loop
                                    acknowledgeRemotionLicense
                                />
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
                                    <div className="relative mb-6">
                                        <Loader2 className="w-16 h-16 text-indigo-500 animate-spin" />
                                        <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-indigo-300">
                                            {Math.round((preloadedCount / (totalPreloadCount || 1)) * 100)}%
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Buffering Cinematic Assets</h3>
                                    <p className="text-slate-400 text-sm max-w-xs leading-relaxed font-medium">
                                        Preloading premium high-resolution images and audio tracks for lag-free cinematic playback...
                                    </p>
                                    <div className="mt-4 text-xs font-mono text-slate-500">
                                        Loaded {preloadedCount} / {totalPreloadCount} components
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Quick Actions */}
                        <div className="mt-8 grid grid-cols-1 gap-3">
                            <button
                                onClick={handleRenderReel}
                                disabled={renderingStatus?.status === 'processing' || isGenerating}
                                className={`w-full py-4 rounded-[1.5rem] font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${
                                    renderingStatus?.status === 'completed'
                                        ? 'bg-green-500 text-white shadow-green-100 hover:bg-green-600'
                                        : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 disabled:bg-indigo-300'
                                }`}
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Generating…
                                    </>
                                ) : renderingStatus?.status === 'processing' ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Rendering {renderingStatus.progress}%
                                    </>
                                ) : renderingStatus?.status === 'completed' ? (
                                    <>
                                        <CheckCircle2 size={20} />
                                        Video Ready
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={20} />
                                        Render High Quality
                                    </>
                                )}
                            </button>

                            {renderingStatus?.outputPath && (
                                <a
                                    href={renderingStatus.outputPath}
                                    download={`reel-${reel.id}.mp4`}
                                    className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-xl"
                                >
                                    <Download size={24} />
                                    Download Final Video
                                </a>
                            )}
                            
                            <button
                                onClick={handleDelete}
                                className="w-full py-4 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center gap-2 font-bold text-sm"
                            >
                                <Trash2 size={16} />
                                Delete Asset Forever
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Metadata & Scenes */}
                <div className="lg:col-span-8 space-y-10 pb-20">
                    {/* Header Info */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-indigo-600 font-black text-xs uppercase tracking-widest">
                            <Video size={14} /> Reel Manifest
                        </div>
                        <h1 className="text-5xl font-black text-slate-900 leading-tight">
                            {reel.businessName || "Untitled Production"}
                        </h1>
                        <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-slate-400">
                            <span className="bg-slate-100 px-3 py-1 rounded-lg flex items-center gap-2">
                                <Palette size={14} /> {reel.artStyle?.replace(/_/g, ' ')}
                            </span>
                            <span className="bg-slate-100 px-3 py-1 rounded-lg flex items-center gap-2">
                                <Clock size={14} /> {Math.round(durationInFrames / 30)}s
                            </span>
                            <span className="bg-slate-100 px-3 py-1 rounded-lg flex items-center gap-2">
                                <Type size={14} /> {reel.scenes.length} Scenes
                            </span>
                        </div>
                    </div>

                    <PublishCopyPanel
                        reelId={reel.id!}
                        copy={reel.publishCopy}
                        canWrite={!!reel.script?.trim() && !isGenerating}
                        onChange={(publishCopy) => setReel({ ...reel, publishCopy })}
                    />

                    {/* Production Narrative */}
                    <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-3">
                            <Type size={20} className="text-indigo-600" />
                            Production Narrative
                        </h2>
                        <div className="text-xl text-slate-700 leading-relaxed font-medium italic">
                            "{reel.script}"
                        </div>
                    </div>

                    {/* Scene Breakdown */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 ml-4">
                            <Sparkles size={20} className="text-indigo-600" />
                            Cinematic Scene Pipeline
                        </h2>
                        <div className="space-y-4">
                            {reel.scenes.map((scene, i) => (
                                <div key={i} className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all border-l-8 border-l-slate-50 hover:border-l-indigo-600">
                                    <div className="flex flex-col md:flex-row gap-8">
                                        <div className="w-full md:w-48 h-48 rounded-3xl overflow-hidden shadow-inner bg-slate-100 flex-shrink-0 relative">
                                            {/* A scene with no image yet rendered an <img src=""> — a broken
                                                image icon, which reads as a failure rather than as work
                                                still in progress. */}
                                            {scene.backgroundUrl && isFootage(scene.backgroundUrl) ? (
                                                // A footage shot in an <img> is just a broken image icon.
                                                <video
                                                    src={scene.backgroundUrl}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    loop
                                                    playsInline
                                                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                                                    onMouseLeave={(e) => e.currentTarget.pause()}
                                                />
                                            ) : scene.backgroundUrl ? (
                                                <img
                                                    src={resolveMediaUrl(scene.backgroundUrl, "", `${scene.id || i}&t=${Date.now()}`) ?? ""}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                    alt={`Scene ${i + 1}`}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                                                    {isGenerating
                                                        ? <Loader2 size={20} className="animate-spin text-indigo-500" />
                                                        : <Palette size={20} />}
                                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                                        {isGenerating ? "Generating" : "No image"}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest">
                                                Scene {i + 1}
                                            </div>
                                            {scene.backgroundUrl && isFootage(scene.backgroundUrl) && (
                                                <div className="absolute bottom-4 left-4 bg-indigo-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5">
                                                    <Film size={11} /> Motion
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-6">
                                            <div>
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                                                    Voiceover / Caption
                                                </label>
                                                <p className="text-base font-bold text-slate-900 leading-snug">
                                                    "{((scene as any).narrationText || scene.headline || '')}"
                                                </p>
                                            </div>
                                            <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-100/50">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                                                        Visual Prompt Engineer
                                                    </label>
                                                    <button
                                                        onClick={() => handleRegenerate(i)}
                                                        disabled={regeneratingIndex === i || isGenerating}
                                                        className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 hover:text-indigo-700 disabled:text-indigo-300 transition-colors uppercase tracking-widest"
                                                    >
                                                        {regeneratingIndex === i ? (
                                                            <Loader2 size={12} className="animate-spin" />
                                                        ) : (
                                                            <RefreshCw size={12} />
                                                        )}
                                                        Regenerate
                                                    </button>
                                                </div>
                                                <textarea
                                                    value={scene.visualPrompt || ""}
                                                    onChange={(e) => handlePromptChange(i, e.target.value)}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-xs text-slate-600 italic font-medium leading-relaxed resize-none p-0 h-20"
                                                    placeholder="Enter visual prompt..."
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
