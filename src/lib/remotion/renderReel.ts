import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { FacelessReel } from "../../types/series";

type RenderReelOptions = {
  reelId: string;
  reelData: FacelessReel;
  outputPath: string;
  onProgress?: (progress: number) => void;
};

export async function renderReelToMp4({
  reelId,
  reelData,
  outputPath,
  onProgress,
}: RenderReelOptions) {
  console.log(`[Remotion] Starting render for reel ${reelId}...`);

  // 🚨 FIX: Rewrite relative URLs to absolute for the headless renderer
  // Remotion runs on port 3001, but the API/Assets are on 3000.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  
  const makeAbsolute = (obj: any): any => {
      if (!obj) return obj;
      if (typeof obj === 'string' && obj.startsWith('/')) {
          return `${baseUrl}${obj}`;
      }
      if (Array.isArray(obj)) {
          return obj.map(makeAbsolute);
      }
      if (typeof obj === 'object') {
          const newObj: any = {};
          for (const key in obj) {
              newObj[key] = makeAbsolute(obj[key]);
          }
          return newObj;
      }
      return obj;
  };

  const absoluteReelData = {
    ...makeAbsolute(reelData),
    baseHost: baseUrl
  };
  console.log("[Remotion] Normalized relative URLs to absolute and injected baseHost.");

  try {
    // 1. Point to the entry file (Root.tsx)
    const entryPoint = path.join(process.cwd(), "src/index.ts");

    // 2. Bundle the project
    console.log("[Remotion] Bundling project...");
    const bundleLocation = await bundle(entryPoint);

    // 3. Select the composition
    console.log("[Remotion] Selecting composition 'FacelessReel'...");
    
    // Calculate exact duration
    const durationMs = (reelData as any).actualDuration || reelData.scenes.reduce((acc, s) => acc + (s.durationInSeconds || 0), 0) * 1000;
    const totalDurationSeconds = Math.max(1, durationMs / 1000);
    const fps = 30;
    const durationInFrames = Math.ceil(totalDurationSeconds * fps);

    console.log(`[Remotion] Target Duration: ${totalDurationSeconds.toFixed(2)}s (${durationInFrames} frames)`);

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "FacelessReel",
      inputProps: {
        reel: absoluteReelData,
      },
    });

    // 4. Render the media
    console.log("[Remotion] Rendering media to MP4...");
    await renderMedia({
      composition: {
        ...composition,
        durationInFrames,
      },
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: {
        reel: absoluteReelData,
      },
      crf: 18,
      timeoutInMilliseconds: 240000, // 4 minutes
      onProgress: ({ progress }) => {
        if (onProgress) onProgress(progress);
        if (Math.round(progress * 100) % 10 === 0) {
            console.log(`[Remotion] Progress: ${Math.round(progress * 100)}%`);
        }
      },
    });

    console.log(`[Remotion] Render complete! Saved to: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error("[Remotion] Render failed:", error);
    throw error;
  }
}
