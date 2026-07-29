import { AbsoluteFill, Sequence, Audio, staticFile, useVideoConfig } from "remotion";
import { ReelScene } from "../components/ReelScene";
import { demoReelData, type ReelData } from "../data/demoReelData";
import { createTimeline } from "../agents/timelineAgent";
import { Subtitle } from "../components/Subtitle";
import { calculateFrameTiming } from "../lib/timing";

type Props = {
    reel?: ReelData;
    enableVoiceover?: boolean;
};

export const OfferReel = ({ reel = demoReelData, enableVoiceover = false }: Props) => {
    const { fps } = useVideoConfig();
    
    // Generate timeline
    const timeline = createTimeline(reel, { 
      audioUrl: enableVoiceover ? "/audio/voiceover.mp3" : undefined 
    });

    let currentStart = 0;

    return (
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
            {/* Render Scenes */}
            {reel.scenes.map((scene) => {
                const duration = scene.durationInSeconds * fps;
                const from = currentStart;
                currentStart += duration;

                return (
                    <Sequence key={scene.id} from={from} durationInFrames={duration}>
                        <ReelScene
                            scene={scene}
                            brandColor={reel.brandColor}
                            accentColor={reel.accentColor}
                        />
                    </Sequence>
                );
            })}

            {/* Render Subtitles from Timeline */}
            {timeline.text.map((caption) => {
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
                        <Subtitle text={caption.text} />
                    </Sequence>
                );
            })}

            {/* Render Audio from Timeline */}
            {timeline.audio.map((audio) => {
                const { startFrame, durationInFrames } = calculateFrameTiming(
                    audio.startMs,
                    audio.endMs,
                    fps
                );

                return (
                    <Sequence 
                        key={audio.id} 
                        from={startFrame} 
                        durationInFrames={durationInFrames}
                    >
                        <Audio 
                            src={staticFile(audio.audioUrl.replace(/^\//, ""))} 
                        />
                    </Sequence>
                );
            })}

            <div
                style={{
                    position: "absolute",
                    top: 138,
                    left: 42,
                    color: "white",
                    fontSize: 28,
                    fontWeight: 900,
                    textShadow: "0 5px 20px rgba(0,0,0,0.4)",
                }}
            >
                @{reel.businessName.replace(/\s+/g, "").toLowerCase()}
            </div>
        </AbsoluteFill>
    );
};