import { FacelessReel } from "../types/series";

// Minimal fixture so the FacelessReel composition is previewable in Remotion
// Studio without hitting the network. Real reels come from the generation
// pipeline; scenes here carry no backgroundUrl, so they render on black.
export const previewReel: FacelessReel = {
    seriesId: "preview",
    businessName: "Preview Reel",
    brandColor: "#6366f1",
    accentColor: "#facc15",
    script: "This is a preview reel. Generate a real one from the dashboard.",
    generationStatus: "pending",
    scenes: [
        {
            id: "preview-1",
            type: "hook",
            durationInSeconds: 3,
            headline: "This is a preview reel",
        },
        {
            id: "preview-2",
            type: "cta",
            durationInSeconds: 3,
            headline: "Generate a real one from the dashboard",
        },
    ],
};

export const PREVIEW_REEL_DURATION_SECONDS = previewReel.scenes.reduce(
    (sum, scene) => sum + scene.durationInSeconds,
    0,
);
