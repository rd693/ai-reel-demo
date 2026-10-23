import { Composition } from "remotion";
import { FacelessReelComposition } from "./compositions/FacelessReelComposition";
import { CardSample, SAMPLE_CARD } from "./compositions/CardSample";
import { previewReel, PREVIEW_REEL_DURATION_SECONDS } from "./data/previewReel";

// NOTE: Render timeouts are set server-side in renderReel.ts via delayRenderTimeoutInMilliseconds.
// Config from "@remotion/cli/config" must NEVER be imported here — it calls process.exit which crashes the bundle.

const FPS = 30;

export const RemotionRoot = () => {
  return (
    <>
    <Composition
      id="FacelessReel"
      component={FacelessReelComposition}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.ceil(PREVIEW_REEL_DURATION_SECONDS * FPS)}
      defaultProps={{ reel: previewReel }}
    />
    {/* The card system, one page at a time. Open it in `npm run studio` to
        work on a deck without rendering a reel to see the change. */}
    <Composition
      id="CardSample"
      component={CardSample}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={90}
      defaultProps={{ deckId: "field-notebook", spec: SAMPLE_CARD, baseHost: "" }}
    />
    </>
  );
};
