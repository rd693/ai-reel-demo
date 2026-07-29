// Core scene/reel shapes shared by the generation pipeline and the Remotion
// compositions. Previously these lived in src/data/demoReelData.ts alongside a
// hardcoded demo fixture; the fixture is gone, the types remain.

export type UGCSceneType =
    | "hook"
    | "problem"
    | "reaction"
    | "offer"
    | "proof"
    | "cta";

export type ReelScene = {
    id: string;
    type: UGCSceneType;
    durationInSeconds: number;
    headline: string;
    caption?: string;
    subText?: string;
    sticker?: string;
    backgroundUrl?: string;
    backgroundType?: "image" | "video";
    backgroundAssetId?: string;
    visualPrompt?: string;
};

export type ReelData = {
    businessName: string;
    brandColor: string;
    accentColor: string;
    scenes: ReelScene[];
    seed?: number;
    usePremiumImageStack?: boolean;
};

// User-uploaded media available as scene backgrounds.
export type Asset = {
    id: string;
    fileName: string;
    url: string;
    type: "image" | "video";
    createdAt: number;
};
