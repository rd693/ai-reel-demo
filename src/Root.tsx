import { Composition } from "remotion";
import { OfferReel } from "./compositions/OfferReel";
import { FacelessReelComposition } from "./compositions/FacelessReelComposition";
import { demoReelData } from "./data/demoReelData";

// NOTE: Render timeouts are set server-side in renderReel.ts via delayRenderTimeoutInMilliseconds.
// Config from "@remotion/cli/config" must NEVER be imported here — it calls process.exit which crashes the bundle.

const FPS = 30;

const durationInFrames =
  demoReelData.scenes.reduce(
    (sum, scene) => sum + scene.durationInSeconds,
    0
  ) * FPS;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="OfferReel"
        component={OfferReel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={durationInFrames}
        defaultProps={{
          reel: demoReelData,
          enableVoiceover: false,
        }}
      />
      <Composition
        id="FacelessReel"
        component={FacelessReelComposition}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS * 60} // Max 60s for faceless reels
        defaultProps={{
          reel: {
            ...demoReelData,
            status: "pending",
            voiceoverUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          } as any,
        }}
      />
    </>
  );
};