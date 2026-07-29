import { useMemo, useEffect } from "react";
import { AbsoluteFill, Sequence, Audio, useVideoConfig, Img, useCurrentFrame, spring, interpolate } from "remotion";
import { FacelessReel } from "../types/series";
import { createTimeline } from "../agents/timelineAgent";
import { calculateFrameTiming } from "../lib/timing";
import { resolveTrackUrl } from "../lib/music";


// --- Robust Media Components ---

/**
 * SafeAudio handles the common "delayRender() not cleared" issue by
 * wrapping the Audio component with a timeout-aware loader.
 * We pass durationInFrames to skip Remotion's internal metadata loading.
 */
/**
 * SimpleAudio: Passes durationInFrames directly to Remotion's <Audio>.
 * When durationInFrames is provided, Remotion skips its internal delayRender
 * duration probe entirely — no double-delayRender deadlock.
 * Returns null if src is empty to avoid trying to decode a corrupt silent file.
 */
const SimpleAudio = ({
    src,
    volume = 1,
    loop = false,
    durationInFrames,
}: {
    src: string;
    volume?: number;
    loop?: boolean;
    durationInFrames: number; // required — always pass this to suppress internal probe
}) => {
    if (!src) return null;
    const safeDuration = Math.max(1, Math.ceil(durationInFrames));
    return (
        <Audio
            src={src}
            volume={volume}
            loop={loop}
            pauseWhenBuffering={false}
            crossOrigin="anonymous"
            {...({ durationInFrames: safeDuration } as any)}
        />
    );
};

const SafeImg = ({ src, style }: { src: string; style?: React.CSSProperties; sceneId?: string }) => {
    // 🚨 Render the Img directly (with a solid black container background)
    // to let the browser immediately paint the preloaded cached image without a React state-change micro-tick blink.
    // Remotion's built-in Img automatically calls delayRender and suspends frame capture during exports perfectly.
    return (
        <AbsoluteFill style={{ ...style, backgroundColor: '#000000' }}>
            <Img 
                src={src} 
                crossOrigin="anonymous"
                style={{
                    ...style,
                    opacity: 1,
                    backgroundColor: '#000000', // Ensure no transparency bleed
                }}
            />
        </AbsoluteFill>
    );
};

// --- Composition ---

type Props = {
    reel: FacelessReel;
    captionStyle?: {
        type: 'word' | 'sentence' | 'split' | 'double';
        animation: 'pop' | 'fade' | 'slide' | 'none';
        color: string;
        fontSize: number;
        fontFamily: string;
        boxEnabled: boolean;
        yOffset?: number;
    };
    musicSettings?: {
        enabled: boolean;
        trackId: string;
        volume: number;
    };
};

export const FacelessReelComposition = ({ reel, captionStyle, musicSettings }: Props) => {
    const { fps } = useVideoConfig();
    const frame = useCurrentFrame();
    
    // Prioritize live settings if passed as prop, otherwise fallback to baked-in style
    const activeCaptionStyle = captionStyle || reel.captionStyle;

    // Memoize timeline
    const timeline = useMemo(() => createTimeline(reel, { 
      audioUrl: reel.voiceoverUrl 
    }), [reel]);
    
    // Scene boundaries driven by ACTUAL audio duration
    const sceneBoundaries = useMemo(() => {
        const actualDurationMs = (timeline as any).actualDurationMs || 0;

        const wordCounts = reel.scenes.map(s =>
            ((s as any).narrationText || (s as any).headline || '')
                .trim().split(/\s+/).filter(Boolean).length
        );
        const totalWords = wordCounts.reduce((a, b) => a + b, 0);
        const totalFrames = Math.round((actualDurationMs / 1000) * fps);

        let elapsedFrames = 0;
        return reel.scenes.map((scene: any, i) => {
            const isLast = i === reel.scenes.length - 1;

            if (typeof scene.startMs === 'number' && typeof scene.endMs === 'number') {
                const start = Math.round((scene.startMs / 1000) * fps);
                let end = Math.round((scene.endMs / 1000) * fps);
                if (isLast) {
                    end = totalFrames;
                }
                return { start, end: Math.max(start + 1, end), scene };
            }

            const start = elapsedFrames;
            const proportion = totalWords > 0
                ? wordCounts[i] / totalWords
                : 1 / reel.scenes.length;
            
            let durationFrames = Math.round(totalFrames * proportion);
            if (isLast) durationFrames = Math.max(0, totalFrames - start);
            
            elapsedFrames += durationFrames;
            return { start, end: elapsedFrames, scene };
        });
    }, [reel.scenes, fps, timeline]);

    useEffect(() => {
        // Preload all background images eagerly
        sceneBoundaries.forEach((boundary, i) => {
            const scene = boundary.scene;
            const rawUrl = scene.backgroundUrl || (scene as any).imageUrl;
            if (!rawUrl) return;
            const baseHost = (reel as any).baseHost || "";
            const isData = rawUrl?.startsWith('data:');
            const imgUrl = (isData || !rawUrl)
                ? rawUrl
                : `${baseHost}/api/image-proxy?url=${encodeURIComponent(rawUrl)}&v=${scene.id || i}`;

            const img = new Image();
            img.crossOrigin = "anonymous"; // ✅ CRITICAL: CORS matches SafeImg and Img cache keys perfectly!
            img.src = imgUrl;
        });
    }, [sceneBoundaries, reel]);

    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>

            {/* 1. Cinematic Background — crossfade transitions to eliminate black blink */}
            <AbsoluteFill>
                {sceneBoundaries.map((boundary, i) => {
                    const scene = boundary.scene;
                    const rawUrl = scene.backgroundUrl || (scene as any).imageUrl;
                    const baseHost = (reel as any).baseHost || "";
                    const isData = rawUrl?.startsWith('data:');
                    const imgUrl = (isData || !rawUrl)
                        ? rawUrl
                        : `${baseHost}/api/image-proxy?url=${encodeURIComponent(rawUrl)}&v=${scene.id || i}`;

                    // --- Improved Transition Logic ---
                    // We use zIndex and staggered visibility to ensure no black frames.
                    // Scene i is visible from its start until scene i+1 is FULLY opaque.
                    
                    const FADE_FRAMES = 15; 
                    const sceneDuration = Math.max(1, boundary.end - boundary.start);

                    // Opacity: Fade IN at the start of the scene
                    const opacity = i === 0 
                        ? 1 
                        : interpolate(
                            frame,
                            [boundary.start, boundary.start + FADE_FRAMES],
                            [0, 1],
                            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                        );

                    // Ken Burns effect scoped to within-scene progress
                    const progress = Math.max(0, (frame - boundary.start) / (sceneDuration + FADE_FRAMES));
                    const scale = interpolate(progress, [0, 1.5], [1.05, 1.3]);
                    const x = interpolate(progress, [0, 1.5], [i % 2 === 0 ? -20 : 20, i % 2 === 0 ? 20 : -20]);
                    const y = interpolate(progress, [0, 1.5], [0, -30]);
                    const transform = `scale(${scale}) translate(${x}px, ${y}px)`;

                    // Visibility logic:
                    // A scene is active from its boundary.start.
                    // It stays visible until the NEXT scene has finished its fade-in (overlap period).
                    const nextSceneStart = sceneBoundaries[i+1]?.start ?? (boundary.end + 200);
                    const isVisible = frame >= boundary.start && frame < nextSceneStart + FADE_FRAMES;
                    
                    if (!isVisible) return null;

                    return (
                        <AbsoluteFill
                            key={`scene-bg-${scene.id || i}-${rawUrl}`}
                            style={{ 
                                opacity, 
                                overflow: 'hidden',
                                zIndex: i, // Higher index scenes render on top
                                backgroundColor: '#000'
                            }}
                        >
                            {imgUrl && (
                                <SafeImg
                                    src={imgUrl}
                                    sceneId={scene.id}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        transform,
                                        filter: 'brightness(1.1) contrast(1.05)',
                                    }}
                                />
                            )}
                        </AbsoluteFill>
                    );
                })}
                {/* Global cinematic vignette overlay */}
                <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "radial-gradient(circle, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%), linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.6) 100%)",
                    zIndex: 100,
                    pointerEvents: 'none'
                }} />
            </AbsoluteFill>

            {/* 2. Viral Dynamic Subtitles */}
            {(() => {
                const type = activeCaptionStyle?.type || 'word';
                
                if ((type as string) === 'single' || type === 'word') {
                    return timeline.text.map((caption, idx) => {
                        const { startFrame, durationInFrames } = calculateFrameTiming(
                            caption.startMs,
                            caption.endMs,
                            fps
                        );

                        return (
                            <Sequence 
                                key={caption.id} 
                                from={startFrame} 
                                durationInFrames={durationInFrames}
                            >
                                <WordCaption 
                                    text={caption.text} 
                                    index={idx}
                                    color={activeCaptionStyle?.color || (idx % 4 === 0 ? "#FFD700" : "#FFFFFF")}
                                    styleSettings={activeCaptionStyle}
                                />
                            </Sequence>
                        );
                    });
                }

                if (type === 'sentence') {
                    return timeline.audio.map((audio, idx) => {
                        const { startFrame, durationInFrames } = calculateFrameTiming(
                            audio.startMs,
                            audio.endMs,
                            fps
                        );

                        const sceneText = timeline.text
                            .filter(t => t.startMs >= audio.startMs && t.endMs <= audio.endMs)
                            .map(t => t.text)
                            .join(" ");

                        if (!sceneText) return null;

                        return (
                            <Sequence 
                                key={`sentence-${idx}`} 
                                from={startFrame} 
                                durationInFrames={durationInFrames}
                            >
                                <WordCaption 
                                    text={sceneText} 
                                    index={idx}
                                    color={activeCaptionStyle?.color || "#FFFFFF"}
                                    styleSettings={{
                                        ...activeCaptionStyle!,
                                        fontSize: (activeCaptionStyle?.fontSize || 140) * 0.45 
                                    }}
                                />
                            </Sequence>
                        );
                    });
                }

                return null;
            })()}

            {/* 3. Narrator Voiceover — skip if no real URL to avoid demuxer errors */}
            {timeline.audio.map((audio, i) => {
                const { startFrame, durationInFrames } = calculateFrameTiming(
                    audio.startMs,
                    audio.endMs,
                    fps
                );

                // Skip rendering if there's no real audio URL (silence is the default)
                if (!audio.audioUrl) return null;

                return (
                    <Sequence
                        key={audio.id}
                        from={startFrame}
                        durationInFrames={durationInFrames}
                    >
                        <SimpleAudio
                            src={audio.audioUrl?.startsWith('http') 
                                ? `${(reel as any).baseHost || ""}/api/audio-proxy?url=${encodeURIComponent(audio.audioUrl)}&v=${audio.id || i}`
                                : audio.audioUrl?.startsWith('/')
                                    ? `${(reel as any).baseHost || ""}${audio.audioUrl}`
                                    : audio.audioUrl
                            }
                            durationInFrames={durationInFrames}
                        />
                    </Sequence>
                );
            })}
            
            {/* 4. Background Music — only render if a valid http URL is configured */}
            {(() => {
                const activeMusicSettings = musicSettings || reel.musicSettings;
                const trackId = activeMusicSettings?.trackId;
                // Resolve the actual URL (handles local IDs vs remote URLs)
                const resolvedUrl = trackId ? resolveTrackUrl(trackId) : "";
                
                if (!resolvedUrl) return null;

                const totalFrames = Math.ceil(((timeline as any).actualDurationMs / 1000) * fps);
                return (
                    <SimpleAudio
                        src={resolvedUrl.startsWith('http') 
                            ? `${(reel as any).baseHost || ""}/api/audio-proxy?url=${encodeURIComponent(resolvedUrl)}&v=bgm`
                            : resolvedUrl.startsWith('/') 
                                ? `${(reel as any).baseHost || ""}${resolvedUrl}`
                                : resolvedUrl
                        }
                        volume={(activeMusicSettings?.volume || 0.5) * 0.3}
                        loop
                        durationInFrames={totalFrames > 0 ? totalFrames : fps * 30}
                    />
                );

            })()}

            {/* Branding / Niche Watermark */}
            <div style={{
                position: "absolute",
                top: 80,
                left: 80,
                color: "rgba(255,255,255,0.6)",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase"
            }}>
                {reel.businessName}
            </div>
        </AbsoluteFill>
    );
};

const WordCaption = ({ 
    text, 
    index, 
    color, 
    styleSettings 
}: { 
    text: string; 
    index: number; 
    color: string;
    styleSettings?: Props['captionStyle'];
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const animationType = styleSettings?.animation || 'pop';
    const springConfig = { damping: 12, stiffness: 200, mass: 0.5 };
    const baseSpring = spring({ frame, fps, config: springConfig });
    
    let transform = "";
    let opacity = 1;

    if (animationType === 'pop') {
        const scale = baseSpring;
        const rotation = interpolate(baseSpring, [0, 1], [index % 2 === 0 ? -5 : 5, 0]);
        transform = `scale(${scale}) rotate(${rotation}deg)`;
    } else if (animationType === 'fade') {
        opacity = interpolate(frame, [0, 10], [0, 1]);
        transform = `translateY(${interpolate(frame, [0, 10], [20, 0])}px)`;
    } else if (animationType === 'slide') {
        const slide = spring({ frame, fps, config: { damping: 20, stiffness: 100 } });
        transform = `translateX(${interpolate(slide, [0, 1], [100, 0])}px)`;
    }

    return (
        <AbsoluteFill style={{ 
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "0 60px",
            paddingBottom: 220 + (styleSettings?.yOffset ?? 0), 
            zIndex: 1000,
            opacity,
        }}>
            <div style={{
                color: index % 3 === 0 ? "#FFD700" : (index % 3 === 1 ? "#32CD32" : "#00FFFF"), 
                fontSize: styleSettings?.fontSize || 130,
                fontWeight: 900,
                textAlign: "center",
                textTransform: "uppercase",
                fontFamily: `${styleSettings?.fontFamily || 'Inter'}, sans-serif`,
                lineHeight: 0.9,
                letterSpacing: "-0.05em",
                padding: styleSettings?.boxEnabled ? "20px 60px" : "0",
                backgroundColor: styleSettings?.boxEnabled ? "rgba(0,0,0,0.85)" : "transparent",
                borderRadius: "20px",
                transform,
                textShadow: "0 15px 50px rgba(0,0,0,0.9)",
                WebkitTextStroke: "12px black",
                paintOrder: "stroke fill",
                boxShadow: styleSettings?.boxEnabled ? "0 25px 60px rgba(0,0,0,0.6)" : "none",
                display: "inline-block",
            }}>
                {text}
            </div>
        </AbsoluteFill>
    );
};

