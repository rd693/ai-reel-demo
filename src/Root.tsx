import { Composition } from "remotion";
import { FacelessReelComposition } from "./compositions/FacelessReelComposition";
import { previewReel, PREVIEW_REEL_DURATION_SECONDS } from "./data/previewReel";

// NOTE: Render timeouts are set server-side in renderReel.ts via delayRenderTimeoutInMilliseconds.
// Config from "@remotion/cli/config" must NEVER be imported here — it calls process.exit which crashes the bundle.

const FPS = 30;

export const RemotionRoot = () => {
  return (
    <Composition
      id="FacelessReel"
      component={FacelessReelComposition}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.ceil(PREVIEW_REEL_DURATION_SECONDS * FPS)}
      defaultProps={{ reel: previewReel }}
    />
  );
};
