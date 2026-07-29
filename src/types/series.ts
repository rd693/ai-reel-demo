import { ReelData, ReelScene } from "./reel";

export type NicheType = string;

export type ArtStyle =
    | "watercolor_illustration"
    | "comic"
    | "creepy_comic"
    | "modern_cartoon"
    | "disney"
    | "mythology"
    | "pixel_art"
    | "ghibli"
    | "anime"
    | "painting"
    | "dark_fantasy"
    | "lego"
    | "polaroid"
    | "realism"
    | "fantastic"
    | "cinematic_3d";

export interface Series {
    id: string;
    name: string;
    niche: NicheType;
    artStyle: ArtStyle;
    voiceId: string;
    frequency: "daily" | "weekly" | "manual";
    targetDuration: number; // in seconds (60, 180, etc.)
    targetPlatforms: ("tiktok" | "instagram" | "youtube")[];
    language: string;
    musicSettings: {
        enabled: boolean;
        trackId: string;
        volume: number;
    };
    seriesContext?: string;
    visualStylePrompt?: string; // ✅ Series-level visual style
    usePremiumImageStack?: boolean; // ✅ Paid/Free stack toggle
    captionStyle: {
        type: 'word' | 'double' | 'sentence';
        animation: 'pop' | 'fade' | 'slide' | 'none';
        color: string;
        fontSize: number;
        fontFamily: string;
        boxEnabled: boolean;
        yOffset?: number; // Distance from bottom in pixels
    };
    reels: FacelessReel[];
    status: "active" | "paused";
    createdAt: Date;
}

export interface FacelessReel extends ReelData {
    id?: string;
    seriesId: string;
    script: string; // The full narrative script
    voiceoverUrl?: string;
    actualDuration?: number; // ✅ Timing property
    captionWords?: any[]; // ✅ Word timings
    status?: string; // ✅ Reel status
    createdAt?: Date; // ✅ Creation date
    language?: string; // ✅ Language
    artStyle?: ArtStyle; // ✅ Per-reel visual style override
    visualStyleOverride?: string; // ✅ Per-reel visual prompt override
    generationStatus: "pending" | "scripted" | "voicing" | "visualizing" | "rendering" | "completed" | "failed";
    scheduledFor?: Date;
    publishedAt?: Date;
    musicSettings?: Series['musicSettings'];
    captionStyle?: Series['captionStyle'];
    socialLinks?: {
        tiktok?: string;
        instagram?: string;
        youtube?: string;
    };
}

export type SceneSegment = ReelScene & {
    narrationText: string; // Specific text being spoken during this scene
    visualPrompt: string; // Prompt used to generate the background for this scene
};
