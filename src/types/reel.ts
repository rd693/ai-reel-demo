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

    /** How this shot frames its subject. Set by the shot planner. */
    shotType?: "wide" | "medium" | "close" | "detail";
    /** What should move, for a shot rendered as footage rather than a still. */
    motionPrompt?: string;

    /** Line spoken over this scene; drives both captions and scene length. */
    narrationText?: string;

    /**
     * How this shot is laid out when the series uses a card deck.
     *
     * Typed as unknown here on purpose: src/types is shared with the browser
     * bundle, and the card types live with the components that render them.
     * The pipeline and the composition both narrow it to CardSpec.
     */
    cardSpec?: unknown;

    // Absolute position on the reel timeline, filled in once the voiceover
    // exists and its word timings are known.
    startMs?: number;
    endMs?: number;
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
